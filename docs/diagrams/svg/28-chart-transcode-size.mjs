/**
 * Hình 6.x — Thời gian từ lúc upload xong tới READY theo kích thước tệp (lượt trung vị của ba lượt),
 * chia ba phần: nhận và probe, chờ task Fargate khởi động, xử lý. Dải mảnh là khoảng min–max của ba
 * lượt. Số liệu: report/generated/chart-v2-transcode.json (từ 2026-11-04-v2-s2b-resized.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, FONT, COLOR, T, block, line, linear, axisX, legendRow, measure, document_, write } from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-v2-transcode.json'), 'utf8'));

const PARTS = [
  { key: 'intake', label: 'Event and probe', color: COLOR.light },
  { key: 'wait', label: 'Waiting for Fargate tasks', color: COLOR.grey },
  { key: 'work', label: 'Processing', color: COLOR.dark },
];
const NAME = {
  clip36: ['36 s clip', 'single path'],
  '100MB': ['100 MB, 2 min', 'single path'],
  '500MB': ['500 MB, 10 min', '10 chunks'],
  '1GB': ['1 GB, 26.7 min', '18 chunks'],
};

const LABEL_R = 150;
const X0 = 162, X1 = 690;
const x = linear(0, 300, X0, X1);
const TOP = 70, ROW = 76, BAR_H = 34;
const axisY = TOP + DATA.rows.length * ROW;
const H = axisY + 60;

const body = [];
body.push(legendRow(12, 26, PARTS.map((p) => ({ color: p.color, label: p.label }))).svg);
body.push(axisX({ scale: x, ticks: [0, 60, 120, 180, 240, 300], y: axisY, top: TOP - 10, title: 'Seconds from the end of the upload to READY' }));

DATA.rows.forEach((r, i) => {
  const top = TOP + i * ROW + 10;
  const [name, sub] = NAME[r.label];
  body.push(T(name, LABEL_R, top + 15, { size: FONT.body, weight: 'bold', anchor: 'end' }));
  body.push(T(sub, LABEL_R, top + 32, { size: FONT.small, anchor: 'end', fill: COLOR.muted }));
  let at = 0;
  for (const p of PARTS) {
    const v = r.parts_s[p.key];
    const x0 = x(at), w = x(at + v) - x0;
    body.push(block(x0, top, w, BAR_H, p.color));
    const label = String(Math.round(v));
    if (measure(label, FONT.small, 'bold') + 8 <= w) {
      body.push(T(label, x0 + w / 2, top + BAR_H / 2 + 5, { size: FONT.small, weight: 'bold', anchor: 'middle', fill: p.color === COLOR.dark ? '#ffffff' : COLOR.ink }));
    }
    at += v;
  }
  const yMid = top + BAR_H + 7;
  const { min, max, median } = r.end_to_end_s;
  body.push(line(x(min), yMid, x(max), yMid, { stroke: COLOR.ink, width: 1.5 }));
  body.push(line(x(min), yMid - 4, x(min), yMid + 4, { stroke: COLOR.ink, width: 1.5 }));
  body.push(line(x(max), yMid - 4, x(max), yMid + 4, { stroke: COLOR.ink, width: 1.5 }));
  body.push(T(`${Math.round(median)} s`, x(median) + 10, top + BAR_H / 2 + 5, { size: FONT.body, weight: 'bold', anchor: 'start' }));
});

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('28-chart-transcode-size', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes');
