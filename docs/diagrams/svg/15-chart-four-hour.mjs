/**
 * Hình 6.x — Video 4 giờ ở hai công suất: thời gian từ lúc tải xong tới READY, chia theo bước.
 *
 * Thay cho bảng `tab:four-hour-breakdown`. Điều cần thấy là pha chunk chiếm gần hết thời gian ở cả hai
 * công suất (84% ở 16 vCPU, 93% ở 8 vCPU), và gấp đôi công suất chỉ rút pha đó chứ không rút các bước
 * cố định như lập kế hoạch và ghép.
 *
 * Thanh là phép cộng bốn bước và một phần "giữa các bước": phần READY không thuộc bước nào, gồm hàng
 * đợi và chuyển giao giữa các job. Phần này do build-report-tables.py tính bằng READY trừ tổng bốn
 * bước, nên tổng các đoạn luôn bằng đúng con số READY.
 *
 * Số liệu: report/generated/chart-four-hour-breakdown.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  W, FONT, COLOR, T, block, linear, axisX, legendRow, measure, document_, write, f1,
} from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-four-hour-breakdown.json'), 'utf8'));

const LABEL_R = 98;
const X0 = 112, X1 = 672;                // 0..150 phút
const x = linear(0, 150, X0, X1);

const BAR_H = 44;
const ROW = 96;
const TOP = 84;
const axisY = TOP + DATA.length * ROW - 10;
const H = axisY + 58;

const STEPS = [
  { key: 'planner_min', label: 'Planner', color: COLOR.grey },
  { key: 'audio_min', label: 'Audio', color: COLOR.mid },
  { key: 'chunks_min', label: 'Chunk jobs', color: COLOR.dark },
  { key: 'finalize_min', label: 'Finalizer', color: COLOR.orange },
  { key: 'between_steps_min', label: 'Between steps', color: COLOR.pale, outline: true },
];

const body = [];
body.push(legendRow(12, 26, STEPS.map((s) => ({ color: s.color, label: s.label, outline: s.outline })), { gap: 22 }).svg);
body.push(axisX({ scale: x, ticks: [0, 30, 60, 90, 120, 150], y: axisY, top: TOP - 14, title: 'Minutes after the upload completed' }));

DATA.forEach((r, i) => {
  const top = TOP + i * ROW + 6;
  body.push(T(`${r.capacity_vcpu} vCPU`, LABEL_R, top + BAR_H / 2 + 5, { size: FONT.body, weight: 'bold', anchor: 'end' }));

  let at = 0;
  for (const s of STEPS) {
    const v = r[s.key];
    if (v == null) continue;
    const x0 = x(at), w = x(at + v) - x0;
    body.push(block(x0, top, w, BAR_H, s.color));
    if (s.outline) body.push(`<rect x="${x0.toFixed(2)}" y="${top}" width="${Math.max(w, 1).toFixed(2)}" height="${BAR_H}" fill="none" stroke="${COLOR.axis}" stroke-width="0.8"/>`);

    // Chữ trong đoạn chỉ khi đủ rộng; đoạn hẹp không ghi số (số nằm ở Phụ lục B).
    const share = Math.round((v / r.ready_min) * 100);
    const inside = s.key === 'chunks_min'
      ? `${f1(v)} min · ${share}%`
      : s.key === 'audio_min' ? f1(v) : null;
    if (inside && measure(inside, FONT.body, 'bold') + 10 <= w) {
      body.push(T(inside, x0 + w / 2, top + BAR_H / 2 + 5, { size: FONT.body, weight: 'bold', anchor: 'middle', fill: s.key === 'audio_min' ? COLOR.ink : '#ffffff' }));
    }
    at += v;
  }

  // Tổng bên phải, kèm lượng tính toán.
  body.push(T(`${f1(r.ready_min)} min`, x(r.ready_min) + 10, top + 19, { size: FONT.body, weight: 'bold', anchor: 'start' }));
  body.push(T(`${f1(r.vcpu_hours)} vCPU-hours`, x(r.ready_min) + 10, top + 38, { size: FONT.small, anchor: 'start', fill: COLOR.muted }));
});

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('15-chart-four-hour', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes', out.copied ? '(copied to report/images)' : '');
