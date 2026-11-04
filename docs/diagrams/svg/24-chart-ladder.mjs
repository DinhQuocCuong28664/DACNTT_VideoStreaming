/**
 * Hình 4.5 — Thang Capped-CRF: trần của mỗi bậc so với bitrate trung bình thật của hai video.
 *
 * Trần (xám) là maxrate video cộng bitrate âm thanh của bậc, để so được với AVERAGE-BANDWIDTH
 * của một bản ghi thật có tiếng (xanh đậm). Mẫu thử tổng hợp (xanh vừa) không có âm thanh. Cùng
 * thang, cùng CRF: nội dung đơn giản dùng ít bit hơn hẳn trần, nội dung thật tiến gần trần.
 *
 * Số liệu: report/generated/chart-ladder.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, FONT, COLOR, T, block, linear, axisX, legendRow, document_, write } from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-ladder.json'), 'utf8')).rows;

const LABEL_X = 12;
const X0 = 120, X1 = 690;
const x = linear(0, 5000, X0, X1);
const BAR_H = 13;
const ROW = 62;
const TOP = 86;
const H_AXIS = TOP + DATA.length * ROW + 4;
const H = H_AXIS + 58;

const body = [];
body.push(legendRow(LABEL_X, 26, [
  { color: COLOR.grey, label: 'Cap: video maxrate + audio' },
  { color: COLOR.dark, label: 'Real recording, average' },
  { color: COLOR.mid, label: 'Test pattern, average' },
], { gap: 22 }).svg);
body.push(T('Rung', LABEL_X, 66, { size: FONT.small, weight: 'bold', anchor: 'start' }));
body.push(axisX({ scale: x, ticks: [0, 1000, 2000, 3000, 4000, 5000], y: H_AXIS, top: TOP - 8, title: 'kbit/s' }));

DATA.forEach((r, i) => {
  const top = TOP + i * ROW + 6;
  const cap = r.cap_video + r.audio;
  body.push(T(r.rung, LABEL_X, top + 28, { size: FONT.body, weight: 'bold', anchor: 'start' }));
  [[cap, COLOR.grey], [r.recording_avg, COLOR.dark], [r.pattern_avg, COLOR.mid]].forEach(([v, c], k) => {
    const y = top + k * (BAR_H + 3);
    body.push(block(x(0), y, x(v) - x(0), BAR_H, c));
    body.push(T(String(v), x(v) + 6, y + 11, { size: FONT.tiny, anchor: 'start', fill: COLOR.muted }));
  });
});

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('24-chart-ladder', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes');
