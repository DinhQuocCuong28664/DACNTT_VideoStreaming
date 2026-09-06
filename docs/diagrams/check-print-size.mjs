/**
 * Kiểm tra cỡ chữ nhỏ nhất của mỗi hình khi in ra giấy.
 *
 * Vì sao cần một script: cỡ chữ hiện trên giấy không phải con số ghi trong mã
 * nguồn sơ đồ, mà là `font_px / canvas_px × bề_rộng_in_ra`. Cùng một `13px` cho
 * ra 6,3pt ở hình HLS (canvas 792px, in 136mm) nhưng chỉ 5,2pt ở hình kiến trúc
 * (canvas 1740px, in 247mm). Nhẩm bằng mắt thì rất dễ nhìn nhầm sang dòng tiêu
 * đề, vốn là chữ to nhất trong hình chứ không phải chữ nhỏ nhất, và báo ra một
 * con số cao hơn thực tế.
 *
 * Bề rộng in ra lấy trực tiếp từ lệnh `\includegraphics` trong các chương, nên
 * đổi hệ số trong tệp .tex là script tự tính lại.
 *
 *   node docs/diagrams/check-print-size.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const CHAPTERS = path.join(ROOT, 'report', 'chapters');

const TW = 160;   // mm, A4 rộng 210 trừ lề 2,5cm mỗi bên
const TH = 247;   // mm, A4 cao 297 trừ lề 2,5cm mỗi bên
const FLOOR = 6.2;

/**
 * Hai hình còn dựng bằng Mermaid không có tệp SVG để đọc cỡ chữ, nên đo bằng
 * chiều cao chữ hoa trên ảnh raster rồi chia cho tỉ lệ chữ hoa của Arial (0,716).
 * Ghi lại kết quả ở đây để bảng luôn đủ tám hình; đo lại khi sửa hai hình đó.
 */
const MEASURED = {
  '02-transcoding-sequence': { pt: 6.54, note: 'Mermaid, đo chữ hoa trên ảnh: 34/5079 px' },
  '08-user-flow': { pt: 6.72, note: 'Mermaid, đo chữ hoa trên ảnh: 32/2340 px' },
};

const inc = /\\includegraphics\[(width|height)=([0-9.]*)\\(textwidth|textheight)\]\{images\/([^}]+)\.png\}/g;

const rows = [];
for (const file of fs.readdirSync(CHAPTERS).filter((f) => f.endsWith('.tex')).sort()) {
  const src = fs.readFileSync(path.join(CHAPTERS, file), 'utf8');
  for (const m of src.matchAll(inc)) {
    rows.push({ dim: m[1], frac: m[2] ? Number(m[2]) : 1, unit: m[3], name: m[4] });
  }
}

let worst = Infinity;
const out = [];
for (const r of rows) {
  const known = MEASURED[r.name];
  if (known) {
    out.push({ name: r.name, pt: known.pt, note: known.note });
    worst = Math.min(worst, known.pt);
    continue;
  }
  const svgPath = path.join(HERE, 'svg', `${r.name}.svg`);
  if (!fs.existsSync(svgPath)) {
    out.push({ name: r.name, pt: null, note: 'không có SVG và cũng chưa đo tay' });
    continue;
  }
  const svg = fs.readFileSync(svgPath, 'utf8');
  const W = Number(svg.match(/width="(\d+)"/)[1]);
  const H = Number(svg.match(/height="(\d+)"/)[1]);
  const sizes = [...svg.matchAll(/font-size="([0-9.]+)"/g)].map((m) => Number(m[1]));
  const min = Math.min(...sizes);

  const base = r.unit === 'textwidth' ? TW : TH;
  let wmm = r.dim === 'width' ? r.frac * base : (r.frac * base * W) / H;
  const pt = (min / W) * (wmm / 25.4) * 72;
  worst = Math.min(worst, pt);
  out.push({ name: r.name, pt, note: `${min}px trên canvas ${W}px, in ra ${wmm.toFixed(0)}mm` });
}

out.sort((a, b) => (a.pt ?? 99) - (b.pt ?? 99));
for (const o of out) {
  const flag = o.pt === null ? '  ?' : o.pt < FLOOR ? '  DƯỚI NGƯỠNG' : '';
  console.log(`${(o.pt === null ? '   -  ' : o.pt.toFixed(2)).padStart(6)} pt  ${o.name.padEnd(26)} ${o.note}${flag}`);
}
console.log(`\nNgưỡng ${FLOOR}pt. Nhỏ nhất hiện tại: ${worst.toFixed(2)}pt.`);
process.exit(worst < FLOOR ? 1 : 0);
