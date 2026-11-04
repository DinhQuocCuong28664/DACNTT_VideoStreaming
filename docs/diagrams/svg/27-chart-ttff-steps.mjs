/**
 * Hình 6.x — Các bước trước khung hình đầu tiên (prod, 720p): lần đầu với cache lạnh và trung bình
 * của 19 lần sau. Số liệu: report/generated/chart-v2-ttff.json (từ 2026-11-04-v2-ttff.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, FONT, COLOR, T, block, linear, axisX, legendRow, measure, document_, write } from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-v2-ttff.json'), 'utf8'));

const STEPS = [
  { key: 'grant', label: 'Grant (API)', color: COLOR.dark },
  { key: 'master', label: 'Master playlist', color: COLOR.mid },
  { key: 'playlist', label: 'Media playlist', color: COLOR.light },
  { key: 'key', label: 'Key (API)', color: COLOR.orange },
  { key: 'segment', label: 'First segment', color: COLOR.grey },
];

const LABEL_R = 150;
const X0 = 162, X1 = 700;
const x = linear(0, 1600, X0, X1);
const TOP = 70, ROW = 92, BAR_H = 40;
const axisY = TOP + DATA.rows.length * ROW;
const H = axisY + 60;

const body = [];
body.push(legendRow(12, 26, STEPS.map((s) => ({ color: s.color, label: s.label })), { gap: 18 }).svg);
body.push(axisX({ scale: x, ticks: [0, 400, 800, 1200, 1600], y: axisY, top: TOP - 10, title: 'Milliseconds, measured from a client in Vietnam' }));

DATA.rows.forEach((r, i) => {
  const top = TOP + i * ROW + 10;
  body.push(T(r.label, LABEL_R, top + 17, { size: FONT.body, weight: 'bold', anchor: 'end' }));
  body.push(T(r.note, LABEL_R, top + 35, { size: FONT.small, anchor: 'end', fill: COLOR.muted }));
  let at = 0;
  for (const s of STEPS) {
    const v = r.steps[s.key];
    const x0 = x(at), w = x(at + v) - x0;
    body.push(block(x0, top, w, BAR_H, s.color));
    const label = String(Math.round(v));
    if (measure(label, FONT.small, 'bold') + 8 <= w) {
      body.push(T(label, x0 + w / 2, top + BAR_H / 2 + 5, { size: FONT.small, weight: 'bold', anchor: 'middle', fill: s.color === COLOR.dark ? '#ffffff' : COLOR.ink }));
    }
    at += v;
  }
  body.push(T(`${Math.round(r.total_ms)} ms`, x(r.total_ms) + 10, top + BAR_H / 2 + 5, { size: FONT.body, weight: 'bold', anchor: 'start' }));
});

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('27-chart-ttff-steps', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes');
