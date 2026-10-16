/**
 * Kiểm tra chữ đè lên hình trên các tệp SVG đã dựng, không phụ thuộc cách từng hình được vẽ.
 *
 * Bước kiểm bố cục trong render.mjs chỉ biết thẻ, khung và nhãn mà nó đã đăng ký; nó không thấy
 * chữ tràn khỏi thẻ, và không dùng được cho hình vẽ bằng ellipse hay bảng thực thể. Script này đọc
 * thẳng SVG, đo chiều rộng thật của từng đoạn chữ bằng chính bộ dựng resvg (cùng phông chữ như
 * khi ra PNG), rồi báo:
 *
 *   - chữ cắt ngang viền của một hình chữ nhật hoặc ellipse (tràn khỏi thẻ, hoặc nằm đè lên viền);
 *   - chữ không có nền trắng mà bị một đường nối cắt qua;
 *   - hai đoạn chữ đè lên nhau.
 *
 * Nhãn trên cạnh có nền trắng riêng; nền đó cũng được kiểm với viền, vì chính nó xoá viền thẻ.
 *
 *   node docs/diagrams/svg/check-text-overlap.mjs            # mọi hình
 *   node docs/diagrams/svg/check-text-overlap.mjs 01 04      # chọn theo số đầu tên tệp
 *
 * Thoát với mã 1 nếu có phát hiện, để gắn vào quy trình dựng hình.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const cache = new Map();
/** Chiều rộng, phần nhô lên và phần thò xuống thật của một đoạn chữ. */
function measure(content, size, weight, family) {
  const key = `${content}|${size}|${weight}|${family}`;
  if (cache.has(key)) return cache.get(key);
  const esc = content.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="300"><text x="100" y="150" ` +
    `font-family="${family}" font-size="${size}" font-weight="${weight}">${esc}</text></svg>`;
  const b = new Resvg(svg, { font: { loadSystemFonts: true } }).getBBox();
  const m = b ? { w: b.width, up: 150 - b.y, down: b.y + b.height - 150 } : { w: content.length * size * 0.55, up: size * 0.8, down: size * 0.2 };
  cache.set(key, m);
  return m;
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

function parse(svg) {
  const texts = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)) {
    const tag = m[1];
    const content = unesc(m[2]).trim();
    if (!content) continue;
    const x = Number(attr(tag, 'x'));
    const y = Number(attr(tag, 'y'));
    const size = Number(attr(tag, 'font-size') ?? 14);
    const weight = attr(tag, 'font-weight') ?? 'normal';
    const anchor = attr(tag, 'text-anchor') ?? 'start';
    const family = attr(tag, 'font-family') ?? 'Arial, Helvetica, sans-serif';
    const mt = measure(content, size, weight, family);
    const left = anchor === 'middle' ? x - mt.w / 2 : anchor === 'end' ? x - mt.w : x;
    texts.push({ content, x: left, y: y - mt.up, w: mt.w, h: mt.up + mt.down, size, fill: attr(tag, 'fill') });
  }

  // Nền trắng của nhãn cạnh: có fill-opacity, nằm ngay trước đoạn chữ của nó.
  const labelBgs = [];
  for (const m of svg.matchAll(/<rect\b([^>]*fill="#ffffff"[^>]*fill-opacity="[^"]*"[^>]*)\/>/g)) {
    labelBgs.push({ x: +attr(m[1], 'x'), y: +attr(m[1], 'y'), w: +attr(m[1], 'width'), h: +attr(m[1], 'height') });
  }

  const rects = [];
  for (const m of svg.matchAll(/<rect\b([^>]*)\/>/g)) {
    const tag = m[1];
    if (!attr(tag, 'stroke') || attr(tag, 'fill-opacity')) continue;   // bỏ nền, sọc hàng, nền nhãn
    const w = +attr(tag, 'width');
    const h = +attr(tag, 'height');
    if (w < 40 || h < 24) continue;                                    // bỏ ô màu chú giải
    rects.push({ x: +attr(tag, 'x'), y: +attr(tag, 'y'), w, h });
  }

  const ellipses = [];
  for (const m of svg.matchAll(/<ellipse\b([^>]*)\/>/g)) {
    ellipses.push({ cx: +attr(m[1], 'cx'), cy: +attr(m[1], 'cy'), rx: +attr(m[1], 'rx'), ry: +attr(m[1], 'ry') });
  }

  const lines = [];
  for (const m of svg.matchAll(/<path\b([^>]*)\/>/g)) {
    const d = attr(m[1], 'd');
    if (!d || attr(m[1], 'fill') !== 'none' || /[^MLZ0-9.\s-]/.test(d)) continue;
    const nums = d.match(/-?[\d.]+/g).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    lines.push(pts);
  }
  return { texts, labelBgs, rects, ellipses, lines };
}

const hit = (a, b, pad = 0) => !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x || a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);
const inside = (a, b, pad = 0) => a.x >= b.x + pad && a.y >= b.y + pad && a.x + a.w <= b.x + b.w - pad && a.y + a.h <= b.y + b.h - pad;

function segHitsRect(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - r.x, r.x + r.w - a[0], a[1] - r.y, r.y + r.h - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/** Hình chữ nhật r có cắt ellipse e không (chuẩn hoá về đường tròn đơn vị). */
function rectHitsEllipse(r, e) {
  const nx0 = (r.x - e.cx) / e.rx, nx1 = (r.x + r.w - e.cx) / e.rx;
  const ny0 = (r.y - e.cy) / e.ry, ny1 = (r.y + r.h - e.cy) / e.ry;
  const px = Math.max(nx0, Math.min(0, nx1)), py = Math.max(ny0, Math.min(0, ny1));
  return px * px + py * py < 1;
}
const rectInsideEllipse = (r, e) =>
  [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
    .every(([x, y]) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1);

export function checkSvg(svg) {
  const { texts, labelBgs, rects, ellipses, lines } = parse(svg);
  const found = [];
  const where = (t) => `"${t.content}" (${Math.round(t.x)},${Math.round(t.y)})`;

  // Mỗi đoạn chữ có nền trắng đi kèm thì kiểm cái nền (nó mới là thứ xoá viền), còn lại kiểm chính chữ.
  const bgOf = (t) => labelBgs.find((b) => b.x <= t.x + 2 && b.y <= t.y + 2 && b.x + b.w >= t.x + t.w - 2 && b.y + b.h >= t.y + t.h - 2);

  for (const t of texts) {
    const bg = bgOf(t);
    const box = bg ?? t;
    for (const r of rects) {
      if (hit(box, r) && !inside(box, r, 1)) {
        // Một phần ngoài, một phần trong: tràn khỏi thẻ, hoặc đè lên viền.
        found.push(`${bg ? 'nhãn' : 'chữ'} ${where(t)} cắt viền hình chữ nhật (${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)}x${Math.round(r.h)})`);
      }
    }
    for (const e of ellipses) {
      if (rectHitsEllipse(box, e) && !rectInsideEllipse(box, e)) {
        found.push(`${bg ? 'nhãn' : 'chữ'} ${where(t)} cắt viền ellipse (${Math.round(e.cx)},${Math.round(e.cy)})`);
      }
    }
    if (!bg && t.fill !== '#ffffff') {   // chữ trắng là số trong huy hiệu, nằm trên đường của nó theo thiết kế
      for (const pts of lines) {
        for (let i = 0; i + 1 < pts.length; i++) {
          if (segHitsRect(pts[i], pts[i + 1], { x: t.x - 1, y: t.y, w: t.w + 2, h: t.h })) {
            found.push(`chữ ${where(t)} bị một đường nối cắt qua`);
            i = pts.length;
          }
        }
      }
    }
  }

  // Chữ lọt trong thẻ nhưng sát viền ngang dưới TIGHT px: chưa đè, nhưng một ký tự nữa là tràn.
  const TIGHT = 8;
  for (const t of texts) {
    const bg = bgOf(t);
    if (bg || t.fill === '#ffffff') continue;
    const holders = rects.filter((r) => inside(t, r, 1)).sort((a, b) => a.w * a.h - b.w * b.h);
    const r = holders[0];
    if (r && r.x + r.w - (t.x + t.w) < TIGHT && t.x - r.x > TIGHT) found.push(`chữ ${where(t)} sát viền phải của thẻ (${Math.round(r.x + r.w - (t.x + t.w))}px)`);
    else if (r && t.x - r.x < TIGHT && r.x + r.w - (t.x + t.w) > TIGHT) found.push(`chữ ${where(t)} sát viền trái của thẻ (${Math.round(t.x - r.x)}px)`);
  }

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const ovy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ov > 2 && ovy > a.h * 0.3) found.push(`chữ ${where(a)} đè chữ ${where(b)}`);
    }
  }
  return [...new Set(found)];
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('check-text-overlap.mjs')) {
  const wanted = process.argv.slice(2);
  const files = fs.readdirSync(HERE).filter((f) => /^\d\d-.*\.svg$/.test(f)).sort()
    .filter((f) => wanted.length === 0 || wanted.some((w) => f.startsWith(w)));
  let total = 0;
  for (const f of files) {
    const found = checkSvg(fs.readFileSync(path.join(HERE, f), 'utf8'));
    total += found.length;
    console.log(`${found.length === 0 ? 'sạch' : `${found.length} chỗ`}  ${f}`);
    for (const line of found) console.log(`    - ${line}`);
  }
  process.exit(total ? 1 : 0);
}
