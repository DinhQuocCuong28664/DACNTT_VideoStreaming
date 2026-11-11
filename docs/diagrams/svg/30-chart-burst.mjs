/**
 * Hình 6.x — 100 upload cùng lúc (prod, cấu hình cuối): mỗi cột là một video đã READY, xếp theo
 * thời gian tới READY; phần xám là thời gian chờ task, phần đậm là xử lý. Các bậc thang cho thấy
 * video được xử lý theo từng đợt vừa trần 48 vCPU. Số liệu: report/generated/chart-v2-burst.json
 * (từ 2026-11-04-v2-s3c-burst.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, FONT, COLOR, T, block, line, linear, legendRow, document_, write } from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-v2-burst.json'), 'utf8'));

const X0 = 70, X1 = 780;
const TOP = 84, BOTTOM = 374;
const y = linear(0, 700, BOTTOM, TOP);
const n = DATA.videos.length;
const step = (X1 - X0) / n;
const H = BOTTOM + 64;

const body = [];
body.push(legendRow(12, 26, [
  { color: COLOR.grey, label: 'Waiting for a Fargate task' },
  { color: COLOR.dark, label: 'Processing' },
]).svg);
for (const t of [0, 100, 200, 300, 400, 500, 600, 700]) {
  body.push(line(X0, y(t), X1, y(t), { stroke: COLOR.grid }));
  body.push(T(String(t), X0 - 8, y(t) + 5, { size: FONT.small, anchor: 'end', fill: COLOR.muted }));
}
body.push(line(X0, BOTTOM, X1, BOTTOM, { stroke: COLOR.axis }));
DATA.videos.forEach((v, i) => {
  const x0 = X0 + i * step + 0.6;
  const w = step - 1.2;
  body.push(block(x0, y(v.wait), w, BOTTOM - y(v.wait), COLOR.grey));
  body.push(block(x0, y(v.total), w, y(v.wait) - y(v.total), COLOR.dark));
});
body.push(T('Seconds to READY', X0, TOP - 12, { size: FONT.small, anchor: 'start', fill: COLOR.ink }));
body.push(T(`${n} timed videos that reached READY, sorted by time to READY`, (X0 + X1) / 2, BOTTOM + 24, { size: FONT.small, anchor: 'middle', fill: COLOR.ink }));
body.push(T(`${DATA.late_ready} more reached READY after a refused completion call; ${DATA.refused_at_creation} of ${DATA.started} were refused at creation`, (X0 + X1) / 2, BOTTOM + 46, { size: FONT.small, anchor: 'middle', fill: COLOR.muted }));

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('30-chart-burst', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes');
