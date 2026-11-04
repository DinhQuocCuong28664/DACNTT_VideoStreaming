/**
 * Hình 6.x — Dòng thời gian của video 4 giờ trên đường chia đoạn (prod, cấu hình cuối).
 * Analyse và audio chạy song song; các chunk bắt đầu khi audio xong. Số liệu:
 * report/generated/chart-v2-four-hour.json (từ 2026-11-04-v2-s4-long.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, FONT, COLOR, T, block, line, linear, axisX, measure, document_, write } from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-v2-four-hour.json'), 'utf8'));

const COLORS = [COLOR.grey, COLOR.light, COLOR.mid, COLOR.dark, COLOR.orange];
const LABEL_R = 150;
const X0 = 162, X1 = 700;
const x = linear(0, 40, X0, X1);               // minutes
const TOP = 30, ROW = 46, BAR_H = 28;
const axisY = TOP + DATA.bars.length * ROW + 10;
const H = axisY + 60;

const body = [];
body.push(axisX({ scale: x, ticks: [0, 5, 10, 15, 20, 25, 30, 35, 40], y: axisY, top: TOP - 6, title: 'Minutes after the upload completed' }));

DATA.bars.forEach((b, i) => {
  const top = TOP + i * ROW + 8;
  const from = b.from / 60, to = b.to / 60;
  body.push(T(b.label, LABEL_R, top + BAR_H / 2 + 5, { size: FONT.body, weight: 'bold', anchor: 'end' }));
  const x0 = x(from), w = x(to) - x0;
  body.push(block(x0, top, w, BAR_H, COLORS[i]));
  const secs = Math.round(b.to - b.from);
  const label = secs >= 60 ? `${(secs / 60).toFixed(1)} min` : `${secs} s`;
  if (measure(label, FONT.small, 'bold') + 10 <= w) {
    body.push(T(label, x0 + w / 2, top + BAR_H / 2 + 5, { size: FONT.small, weight: 'bold', anchor: 'middle', fill: COLORS[i] === COLOR.dark ? '#ffffff' : COLOR.ink }));
  } else {
    body.push(T(label, x0 + w + 8, top + BAR_H / 2 + 5, { size: FONT.small, anchor: 'start', fill: COLOR.muted }));
  }
});

const end = DATA.end_to_end_s / 60;
body.push(line(x(end), TOP, x(end), axisY, { stroke: COLOR.ink, width: 1.2, dash: '4 3' }));
const tag = `READY at ${end.toFixed(1)} min`;
body.push(T(tag, x(end) - 8, TOP + 4, { size: FONT.small, weight: 'bold', anchor: 'end' }));

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('29-chart-four-hour', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes');
