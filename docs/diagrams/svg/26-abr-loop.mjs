/**
 * Hình 4.8 — Vòng chọn chất lượng của hls.js với cấu hình của trình phát
 * (web/src/components/Video/VideoPlayer.tsx: startLevel -1, capLevelToPlayerSize true).
 * Giá trị mặc định ghi theo tài liệu API của hls.js: ước lượng ban đầu 500 kbit/s,
 * abrBandWidthFactor 0,95.
 */
import { card, group, edge, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { cardTitle: 20, cardSub: 18.5, cardSubLH: 22, groupLabel: 18.5, edgeLabel: 18.5 });

const W = 1320;
const H = 720;
const p = [];

const start = card({ x: 40, y: 80, w: 250, h: 170, title: 'Start', sub: ['master playlist loaded;', 'no samples yet, so the', 'estimate is 500 kbit/s', '(startLevel: auto)'], tone: 'plain' });
p.push(start.svg);

const loop = group({ x: 340, y: 40, w: 640, h: 560, label: 'Repeated for every segment', stroke: PALETTE.network.stroke, fill: '#f6fbf6' });
p.push(loop.svg);
const load = card({ x: 380, y: 100, w: 250, h: 150, title: 'Load segment', sub: ['from the chosen', 'rendition, through', 'the CDN'], tone: 'network' });
const measure = card({ x: 700, y: 100, w: 250, h: 150, title: 'Measure', sub: ['bytes over time of the', 'download, folded into', 'moving averages'], tone: 'network' });
const estimate = card({ x: 700, y: 390, w: 250, h: 170, title: 'Estimate', sub: ['bandwidth estimate', '× 0.95 safety factor', '(abrBandWidthFactor)'], tone: 'network' });
const choose = card({ x: 380, y: 390, w: 250, h: 170, title: 'Choose a rung', sub: ['highest BANDWIDTH', 'under the estimate;', 'switch at the next', 'segment boundary'], tone: 'network' });
p.push(load.svg, measure.svg, estimate.svg, choose.svg);

const limits = card({ x: 1030, y: 380, w: 260, h: 190, title: 'Limits', sub: ['capLevelToPlayerSize:', 'no rung larger than', 'the video element;', 'a manual choice in the', 'menu turns ABR off'], tone: 'plain' });
const buffer = card({ x: 1030, y: 100, w: 260, h: 170, title: 'Buffer running low', sub: ['a slow download is', 'abandoned and a', 'lower rung is loaded', 'at once'], tone: 'secret' });
p.push(limits.svg, buffer.svg);

p.push(edge([[start.box.r, 175], [load.box.x, 175]]));
p.push(edge([[load.box.r, load.box.cy], [measure.box.x, load.box.cy]]));
p.push(edge([[measure.box.cx, measure.box.b], [measure.box.cx, estimate.box.y]]));
p.push(edge([[estimate.box.x, estimate.box.cy], [choose.box.r, estimate.box.cy]]));
p.push(edge([[choose.box.cx, choose.box.y], [choose.box.cx, load.box.b]]));
p.push(edge([[limits.box.x, limits.box.cy], [estimate.box.r, limits.box.cy]], { dashed: true }));
p.push(edge([[buffer.box.x, 185], [measure.box.r, 185]], { dashed: true }));

p.push(text(['The ladder makes this loop work: every rung starts each segment with a key frame at the same',
  'instant, so a switch never shows a gap, and BANDWIDTH is a measured peak, so the choice is safe.'],
  40, 650, { size: 18.5, anchor: 'start', fill: PALETTE.muted, lineHeight: 23 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('26-abr-loop', svg, 3);
console.log(`26-abr-loop -> ${(out.bytes / 1024).toFixed(0)} KB`);
