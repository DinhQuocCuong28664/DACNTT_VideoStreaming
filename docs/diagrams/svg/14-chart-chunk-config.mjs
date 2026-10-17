/**
 * Hình 6.x — Một video 25 phút trên đường chia đoạn, qua các lần chỉnh cấu hình: thời gian tới READY
 * và lượng tính toán đã dùng.
 *
 * Thay cho bảng `tab:chunk-config`. Bảng 10 dòng bảy cột kể một câu chuyện theo thứ tự đo: từ 36,3
 * phút xuống 14,7 phút, và On-Demand đắt hơn Spot mà không nhanh hơn. Hình đặt hai điều đó cạnh nhau.
 *
 * Bên trái là thời gian tới READY, chia hai đoạn: pha chunk (xanh đậm) và phần còn lại gồm lập kế
 * hoạch, âm thanh và ghép (xanh nhạt). Lượt đầu không ghi pha chunk nên chỉ có một cột xám. Bên
 * phải là vCPU-giây; lượt đầu không có số này nên để trống.
 *
 * Số liệu: report/generated/chart-chunk-config-25min.json, sinh cùng lúc với bảng bởi
 * build-report-tables.py, theo cùng thứ tự dòng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  W, FONT, COLOR, T, line, block, linear, axisX, legendRow, measure, document_, write, f1,
} from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-chunk-config-25min.json'), 'utf8'));

const LABEL_X = 12;
const AX0 = 236, AX1 = 500;          // thang thời gian: 0..40 phút
const BX0 = 604, BX1 = 722;          // thang vCPU-giây: 0..12000
const x = linear(0, 40, AX0, AX1);
const xb = linear(0, 12000, BX0, BX1);

const BAR_H = 22;
const ROW = 44;
const TOP = 118;
const H_AXIS = TOP + DATA.length * ROW + 6;
const H = H_AXIS + 58;

const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const body = [];

// Đầu cột và chú giải. Dòng chú giải thứ hai là của cột vCPU-giây: lượt đo đầu chỉ cộng các job chunk,
// các lượt sau cộng mọi job của video, nên hai loại cột không so thẳng với nhau được và phải phân biệt.
body.push(`<defs><pattern id="chunks-only" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
  `<rect width="7" height="7" fill="#ffffff"/><rect width="3.5" height="7" fill="${COLOR.mid}"/></pattern></defs>`);
body.push(T('Chunks × vCPU each', LABEL_X, 78, { size: FONT.small, weight: 'bold', anchor: 'start' }));
body.push(T('Time to READY', (AX0 + AX1) / 2, 78, { size: FONT.small, weight: 'bold', anchor: 'middle' }));
body.push(T('Compute', (BX0 + BX1) / 2, 78, { size: FONT.small, weight: 'bold', anchor: 'middle' }));
body.push(legendRow(LABEL_X, 24, [
  { color: COLOR.dark, label: 'Chunk phase' },
  { color: COLOR.light, label: 'Rest: planning, audio, finalizing' },
  { color: COLOR.grey, label: 'Phase not recorded' },
], { gap: 22 }).svg);
body.push(legendRow(LABEL_X, 48, [
  { color: COLOR.mid, label: 'vCPU-seconds of all jobs' },
  { color: 'url(#chunks-only)', label: 'vCPU-seconds of chunk jobs only', outline: true },
], { gap: 22 }).svg);

body.push(axisX({ scale: x, ticks: [0, 10, 20, 30, 40], y: H_AXIS, top: TOP - 10, title: 'Minutes' }));
body.push(axisX({ scale: xb, ticks: [0, 6000, 12000], y: H_AXIS, top: TOP - 10, fmt: (v) => thousands(v), title: 'vCPU-seconds' }));

DATA.forEach((r, i) => {
  const top = TOP + i * ROW + (ROW - BAR_H) / 2;
  const mid = TOP + i * ROW + ROW / 2;

  // Hai dòng nhãn: cấu hình đoạn (đậm) và loại Fargate cùng công suất.
  const dagger = r.production ? ' †' : '';
  body.push(T(`${r.chunks} × ${r.chunk_vcpu} vCPU${dagger}`, LABEL_X, mid - 2, { size: FONT.small, weight: 'bold', anchor: 'start' }));
  body.push(T(`${r.fargate}, ${r.capacity_vcpu} vCPU`, LABEL_X, mid + 14, { size: FONT.tiny, anchor: 'start', fill: COLOR.muted }));

  if (r.phase_min == null) {
    body.push(block(x(0), top, x(r.ready_min) - x(0), BAR_H, COLOR.grey));
  } else {
    // Thanh là phép cộng chứ không phải trục thời gian: dữ liệu chỉ cho biết độ dài pha chunk và tổng
    // tới READY, không cho biết phần còn lại chia thế nào trước và sau pha chunk, nên không vẽ thứ tự.
    body.push(block(x(0), top, x(r.phase_min) - x(0), BAR_H, COLOR.dark));
    body.push(block(x(r.phase_min), top, x(r.ready_min) - x(r.phase_min), BAR_H, COLOR.light));
  }
  body.push(T(f1(r.ready_min), x(r.ready_min) + 8, top + 16, { size: FONT.small, weight: 'bold', anchor: 'start' }));

  if (r.vcpu_seconds != null) {
    const fill = r.vcpu_seconds_scope === 'chunks_only' ? 'url(#chunks-only)' : COLOR.mid;
    body.push(block(xb(0), top, xb(r.vcpu_seconds) - xb(0), BAR_H, fill));
    if (fill !== COLOR.mid) body.push(`<rect x="${xb(0)}" y="${top}" width="${xb(r.vcpu_seconds) - xb(0)}" height="${BAR_H}" fill="none" stroke="${COLOR.mid}" stroke-width="1"/>`);
    body.push(T(thousands(r.vcpu_seconds), xb(r.vcpu_seconds) + 8, top + 16, { size: FONT.small, anchor: 'start' }));
  } else {
    body.push(T('n/a', xb(0) + 8, top + 16, { size: FONT.small, anchor: 'start', fill: COLOR.muted }));
  }
});

// Đường ngăn giữa nhóm 8 vCPU và nhóm 16 vCPU, nếu cả hai có mặt.
const firstBig = DATA.findIndex((r) => r.capacity_vcpu === 16);
if (firstBig > 0) {
  const ySep = TOP + firstBig * ROW;
  body.push(line(LABEL_X, ySep, BX1 + 70, ySep, { stroke: COLOR.axis, dash: '4 4' }));
}

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('14-chart-chunk-config', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes', out.copied ? '(copied to report/images)' : '');
