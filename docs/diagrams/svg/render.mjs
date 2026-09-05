/**
 * Bộ dựng sơ đồ kiến trúc dạng SVG, có icon chính thức của từng dịch vụ.
 *
 * Vì sao không dùng Mermaid cho những sơ đồ này: Mermaid chỉ nhận icon qua lệnh
 * `registerIconPacks`, là một lời gọi JavaScript mà mermaid-cli không phơi ra,
 * nên chạy qua CLI thì mọi icon đều thành dấu hỏi. Ngoài ra, bố cục tự động của
 * Mermaid không đặt được các khối lồng nhau theo đúng ranh giới triển khai mà
 * sơ đồ cần thể hiện. Ở đây toạ độ do người viết đặt, đổi lại là kiểm soát được
 * hoàn toàn và kết quả ổn định qua mỗi lần dựng.
 *
 * Các sơ đồ còn lại (tuần tự, ERD, use case, luồng người dùng) vẫn giữ Mermaid
 * vì đó là những loại sơ đồ Mermaid làm tốt và không cần icon.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = JSON.parse(fs.readFileSync(path.join(HERE, 'icons.json'), 'utf8'));

export const PALETTE = {
  ink: '#1a1a1a',
  muted: '#5b6470',
  line: '#4a5568',
  storage: { fill: '#e8f4f8', stroke: '#2c7a9e' },
  compute: { fill: '#fff4e6', stroke: '#d98324' },
  network: { fill: '#eef7ee', stroke: '#3d8b40' },
  secret: { fill: '#fdecea', stroke: '#c0392b' },
  plain: { fill: '#f7f8fa', stroke: '#98a2b3' },
  groupStroke: '#8a94a6',
  groupFill: '#fbfcfd',
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Nhúng một icon iconify, giữ nguyên tỉ lệ khung hình.
 *
 * Các logo trong bộ này không vuông: Cloudflare rộng gấp hơn hai lần chiều cao,
 * MongoDB thì cao hơn rộng. Nếu scale riêng từng trục cho vừa một ô vuông thì
 * logo bị bóp méo, nhìn ra ngay và làm hỏng cảm giác chuyên nghiệp của sơ đồ.
 * Vì vậy scale đều theo cạnh dài rồi căn giữa trong ô `size` x `size`, `x` và
 * `y` là góc trên trái của ô đó.
 */
function icon(name, x, y, size) {
  const ic = ICONS.icons[name];
  if (!ic) throw new Error(`Khong co icon "${name}" trong icons.json`);
  const k = size / Math.max(ic.width, ic.height);
  const dx = x + (size - ic.width * k) / 2;
  const dy = y + (size - ic.height * k) / 2;
  return `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${k.toFixed(5)})">${ic.body}</g>`;
}

function textLines(str, x, y, opts = {}) {
  const {
    size = 14, weight = 'normal', fill = PALETTE.ink,
    anchor = 'middle', lineHeight = size * 1.25, family = 'Arial, Helvetica, sans-serif',
  } = opts;
  const lines = Array.isArray(str) ? str : [str];
  return lines
    .map((l, i) =>
      `<text x="${x}" y="${(y + i * lineHeight).toFixed(1)}" font-family="${family}" font-size="${size}" ` +
      `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`)
    .join('');
}

/**
 * Thẻ một thành phần: icon ở trên, tên đậm ở dưới, chú thích nhỏ tuỳ chọn.
 * Trả về cả hình vẽ lẫn hộp bao, để cạnh nối bám vào mép thẻ chứ không phải
 * vào một toạ độ đoán chừng.
 */
export function card(spec) {
  const {
    x, y, w = 168, h = 104, iconName, title, sub, tone = 'plain', iconSize = 34,
  } = spec;
  const c = PALETTE[tone] ?? PALETTE.plain;

  const parts = [];
  parts.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ` +
    `fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/>`);
  if (iconName) parts.push(icon(iconName, x + w / 2 - iconSize / 2, y + 12, iconSize));

  const titleY = y + 12 + (iconName ? iconSize + 20 : 26);
  const titles = Array.isArray(title) ? title : [title];
  parts.push(textLines(titles, x + w / 2, titleY, { size: 16, weight: 'bold' }));

  if (sub) {
    const subY = titleY + titles.length * 20 + 3;
    parts.push(textLines(sub, x + w / 2, subY, { size: 13.5, fill: PALETTE.muted, lineHeight: 16.5 }));
  }

  return {
    svg: parts.join(''),
    box: { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h },
  };
}

/** Khối bao nét đứt kèm nhãn, dùng cho ranh giới tài khoản hoặc tầng hệ thống. */
export function group(spec) {
  const { x, y, w, h, label, stroke = PALETTE.groupStroke, fill = PALETTE.groupFill, dash = '7 5', iconName } = spec;
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" ` +
    `stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${dash}"/>`,
  ];
  const lx = x + 16;
  if (iconName) {
    parts.push(icon(iconName, lx, y + 10, 20));
    parts.push(textLines(label, lx + 30, y + 26, { size: 15, weight: 'bold', anchor: 'start', fill: stroke }));
  } else {
    parts.push(textLines(label, lx, y + 26, { size: 15, weight: 'bold', anchor: 'start', fill: stroke }));
  }
  return { svg: parts.join(''), box: { x, y, w, h, r: x + w, b: y + h } };
}

/**
 * Cạnh nối theo các điểm gãy cho sẵn. Không dùng định tuyến tự động: sơ đồ này
 * ít cạnh nhưng nhiều khối lồng nhau, nên đặt tay cho kết quả sạch hơn và
 * không đổi bố cục sau mỗi lần dựng.
 */
export function edge(points, opts = {}) {
  const {
    label, dashed = false, color = PALETTE.line, labelAt = 0.5,
    labelDx = 0, labelDy = -7, width = 1.8, arrow = true, labelBg = true,
  } = opts;

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const parts = [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ` +
    `${dashed ? 'stroke-dasharray="6 4" ' : ''}${arrow ? 'marker-end="url(#arrow)"' : ''}/>`,
  ];

  if (label) {
    // Đặt nhãn trên đoạn dài nhất để chữ không đè lên chỗ đường gãy.
    let best = 0, bestLen = -1;
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      if (len > bestLen) { bestLen = len; best = i; }
    }
    const a = points[best], b = points[best + 1];
    const lx = a[0] + (b[0] - a[0]) * labelAt + labelDx;
    const ly = a[1] + (b[1] - a[1]) * labelAt + labelDy;
    const text = String(label);
    if (labelBg) {
      const wpx = text.length * 7.2 + 14;
      parts.push(`<rect x="${(lx - wpx / 2).toFixed(1)}" y="${(ly - 13).toFixed(1)}" width="${wpx.toFixed(1)}" ` +
        `height="19" rx="4" fill="#ffffff" fill-opacity="0.93"/>`);
    }
    parts.push(textLines(text, lx, ly, { size: 13, fill: PALETTE.muted }));
  }
  return parts.join('');
}

/** Chú giải các kiểu đường nét dùng trong sơ đồ. */
export function legend(x, y, entries) {
  const parts = [];
  let cx = x;
  for (const e of entries) {
    parts.push(`<path d="M ${cx} ${y} L ${cx + 30} ${y}" stroke="${e.color ?? PALETTE.line}" stroke-width="1.8" ` +
      `${e.dashed ? 'stroke-dasharray="6 4" ' : ''}marker-end="url(#arrow)"/>`);
    parts.push(textLines(e.label, cx + 38, y + 5, { size: 13.5, anchor: 'start', fill: PALETTE.muted }));
    cx += 38 + e.label.length * 7.3 + 34;
  }
  return parts.join('');
}

/**
 * Chip một bước trong quy trình: nhỏ hơn `card`, icon nằm bên trái chữ.
 * Dùng cho sơ đồ CI/CD, nơi một hàng có tới năm bước nối tiếp nên thẻ vuông
 * kiểu `card` sẽ không đủ chỗ.
 */
export function chip(spec) {
  const { x, y, w = 150, h = 46, iconName, label, tone = 'plain', iconSize = 20 } = spec;
  const c = PALETTE[tone] ?? PALETTE.plain;
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ` +
    `fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4"/>`,
  ];

  const lines = Array.isArray(label) ? label : [label];
  const textX = iconName ? x + iconSize + 20 : x + w / 2;
  const anchor = iconName ? 'start' : 'middle';
  if (iconName) parts.push(icon(iconName, x + 11, y + (h - iconSize) / 2, iconSize));

  const startY = y + h / 2 + (lines.length === 1 ? 4.5 : -2);
  parts.push(textLines(lines, textX, startY, { size: 13, anchor, lineHeight: 15 }));

  return {
    svg: parts.join(''),
    box: { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h },
  };
}

/**
 * Thanh tỉ lệ hai phần, dùng để so sánh hai đại lượng chênh nhau rất xa.
 * Với mức sử dụng 0,5% thì một con số trong bảng không gây ấn tượng gì, còn
 * một dải gần như trống thì nói ngay được vấn đề.
 */
export function bar(spec) {
  const {
    x, y, w, h = 26, fraction, fillColor = PALETTE.compute.stroke,
    trackColor = '#e6e9ee', label, valueLabel,
  } = spec;
  const fillW = Math.max(w * fraction, 2);
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${trackColor}"/>`,
    `<rect x="${x}" y="${y}" width="${fillW.toFixed(2)}" height="${h}" rx="5" fill="${fillColor}"/>`,
  ];
  if (label) parts.push(textLines(label, x, y - 9, { size: 13, anchor: 'start', fill: PALETTE.muted }));
  if (valueLabel) {
    parts.push(textLines(valueLabel, x + w, y - 9, { size: 13, anchor: 'end', fill: PALETTE.ink, weight: 'bold' }));
  }
  return { svg: parts.join(''), box: { x, y, w, h, r: x + w, b: y + h } };
}

/** Nhãn chữ tự do, cho tiêu đề nhóm hoặc ghi chú ngoài thẻ. */
export function text(str, x, y, opts = {}) {
  return textLines(str, x, y, opts);
}

/** Ghép các phần thành một tài liệu SVG hoàn chỉnh. */
export function document_({ width, height, body, title }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${PALETTE.line}"/>
  </marker>
</defs>
<rect width="${width}" height="${height}" fill="#ffffff"/>
${title ? textLines(title, width / 2, 34, { size: 18, weight: 'bold' }) : ''}
${body}
</svg>`;
}

/** Ghi SVG ra đĩa và rasterize ở độ phân giải gấp `scale` lần cho bản in. */
export function write(name, svg, scale = 3) {
  const svgPath = path.join(HERE, `${name}.svg`);
  fs.writeFileSync(svgPath, svg);

  const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: true } })
    .render().asPng();
  const pngPath = path.join(HERE, '..', `${name}.png`);
  fs.writeFileSync(pngPath, png);

  return { svgPath, pngPath, bytes: png.length };
}
