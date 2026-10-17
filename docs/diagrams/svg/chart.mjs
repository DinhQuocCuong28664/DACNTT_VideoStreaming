/**
 * Phần vẽ chung cho các biểu đồ số liệu (hình 11 trở đi), dựng trên render.mjs.
 *
 * Biểu đồ khác sơ đồ ở chỗ mọi toạ độ đều suy ra từ số liệu, nên không có toạ độ đặt tay: người viết
 * khai báo thang đo (`linear`), và chữ, cột, trục đều đặt theo thang đó. Cách làm này loại bỏ đúng
 * lỗi mà sơ đồ hay gặp, là nhãn đè lên hình, vì chỗ đặt nhãn được tính từ chiều rộng thật của chữ.
 *
 * Quy ước chung cho mọi biểu đồ:
 *   - canvas rộng 800px và in ra 160mm, nên 1px = 0,2mm và chữ 12px ra 6,8pt, 14px ra 7,9pt;
 *   - cột không có viền (`stroke`), để check-text-overlap.mjs không coi cột là thẻ chứa chữ;
 *   - lưới và trục vẽ bằng <line>, cũng để script đó không nhầm với đường nối của sơ đồ;
 *   - nền trắng, ba tông độ sáng khác nhau cho mọi bộ màu, để in đen trắng vẫn phân biệt được.
 */
import { Resvg } from '@resvg/resvg-js';
import { text, document_, write, PALETTE } from './render.mjs';

export { document_, write };

export const W = 800;
export const FONT = { body: 14, small: 13, tiny: 12 };

/** Bộ màu: mỗi màu một độ sáng riêng, nên giữ phân biệt được khi in đen trắng. */
export const COLOR = {
  ink: PALETTE.ink,
  muted: PALETTE.muted,
  grid: '#e3e7ec',
  axis: '#8a94a6',
  dark: '#1d5876',    // xanh đậm: giá trị chính, kết quả sau cải thiện
  mid: '#6aa7c4',     // xanh vừa
  light: '#bcd8e6',   // xanh nhạt: phần phụ
  orange: '#d98324',  // cam: điểm cần chú ý
  grey: '#b8bfc9',    // xám: nền so sánh, thời gian chờ
  pale: '#e8ebf0',    // xám rất nhạt
};

const cache = new Map();
/** Chiều rộng thật của một đoạn chữ khi dựng bằng resvg, cùng phông chữ như khi ra PNG. */
export function measure(str, size = FONT.body, weight = 'normal') {
  const key = `${str}|${size}|${weight}`;
  if (cache.has(key)) return cache.get(key);
  const esc = String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="300"><text x="100" y="150" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}">${esc}</text></svg>`;
  const b = new Resvg(svg, { font: { loadSystemFonts: true } }).getBBox();
  const w = b ? b.width : String(str).length * size * 0.55;
  cache.set(key, w);
  return w;
}

/** Thang tuyến tính từ miền dữ liệu [d0, d1] sang miền toạ độ [r0, r1]. */
export function linear(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) * (r1 - r0)) / (d1 - d0);
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

/** Chữ một dòng; `anchor` là start, middle hoặc end. */
export function T(str, x, y, o = {}) {
  return text(str, x, y, { size: FONT.body, ...o });
}

export function line(x1, y1, x2, y2, { stroke = COLOR.axis, width = 1, dash } = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"` +
    `${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

/** Cột chữ nhật, cố ý không có `stroke` (xem đầu tệp). Bề rộng âm hoặc bằng 0 thì vẽ một vạch 1px. */
export function block(x, y, w, h, fill) {
  const width = Math.max(w, 1);
  return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}"/>`;
}

/**
 * Trục ngang: vạch chia, lưới dọc nhạt chạy ngược lên `top`, nhãn số và tên trục.
 * Lưới vẽ trước cột (xếp trong `body` trước), nên cột che lưới chứ không ngược lại.
 */
export function axisX({ scale, ticks, y, top, fmt = (v) => String(v), title }) {
  const parts = [];
  for (const t of ticks) {
    const x = scale(t);
    parts.push(line(x, top, x, y, { stroke: COLOR.grid }));
    parts.push(line(x, y, x, y + 5, { stroke: COLOR.axis }));
    parts.push(T(fmt(t), x, y + 22, { size: FONT.small, anchor: 'middle', fill: COLOR.muted }));
  }
  parts.push(line(scale.range[0], y, scale.range[1], y, { stroke: COLOR.axis }));
  if (title) {
    parts.push(T(title, (scale.range[0] + scale.range[1]) / 2, y + 46, { size: FONT.small, anchor: 'middle', fill: COLOR.ink }));
  }
  return parts.join('');
}

/** Một dòng chú giải: ô màu vuông và chữ, trả về cả toạ độ phải để xếp mục kế tiếp. */
export function legendItem(x, y, color, label, { size = FONT.small, outline = false } = {}) {
  const sw = 14;
  const svg = `<rect x="${x}" y="${y - 11}" width="${sw}" height="${sw}" fill="${color}"` +
    `${outline ? ` stroke="${COLOR.axis}" stroke-width="1"` : ''}/>` +
    T(label, x + sw + 7, y, { size, anchor: 'start' });
  return { svg, right: x + sw + 7 + measure(label, size) };
}

/** Xếp nhiều mục chú giải liền nhau trên một hàng, cách nhau `gap` px. */
export function legendRow(x, y, items, { gap = 26, size = FONT.small } = {}) {
  let cx = x;
  const out = [];
  for (const it of items) {
    const r = legendItem(cx, y, it.color, it.label, { size, outline: it.outline });
    out.push(r.svg);
    cx = r.right + gap;
  }
  return { svg: out.join(''), right: cx - gap };
}

/** Số thực in với `d` chữ số thập phân, giống cách bảng in. */
export const f1 = (v) => v.toFixed(1);
export const f2 = (v) => v.toFixed(2);
