/**
 * Hình 4.4 — Đồ thị xử lý của một lần chạy ffmpeg ở đường đơn (transcoder/src/ffmpeg/args.ts,
 * singleJobArgs). Nguồn đọc một lần, bộ giải mã chạy một lần và đưa từng khung cho chuỗi lọc
 * riêng của mỗi đầu ra; mỗi bậc là một đầu ra HLS riêng. Tham số ghi đúng giá trị trong
 * shared/src/ladder.ts; hai hàng đầu là 1080p và 720p, hàng cuối đại diện các bậc thấp hơn.
 */
import { card, chip, group, edge, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { cardTitle: 18, cardSub: 15.5, cardSubLH: 19, groupLabel: 16.5, edgeLabel: 15.5, chipLabel: 15.5, chipLabelLH: 18 });

const W = 1660;
const H = 960;
const p = [];

const source = card({ x: 40, y: 360, w: 190, h: 140, iconName: 'aws-s3', iconSize: 30, title: 'Source file', sub: ['copied from S3', 'to local disk'], tone: 'storage' });
const decode = card({ x: 280, y: 330, w: 200, h: 200, title: 'ffmpeg', sub: ['demux and decode', 'once; every frame', 'goes to every', 'output'], tone: 'plain' });
p.push(source.svg, decode.svg);

const rows = [
  { name: '1080p', y: 50, crf: 22, max: '4500k', buf: '9000k', aac: '128k' },
  { name: '720p', y: 340, crf: 23, max: '2200k', buf: '4400k', aac: '128k' },
  { name: '480p … 144p', y: 630, crf: '24 … 28', max: '1100k … 180k', buf: '2200k … 360k', aac: '64k' },
];
const muxers = [];
for (const r of rows) {
  const g = group({ x: 520, y: r.y, w: 900, h: 260, label: `${r.name} output`, stroke: PALETTE.compute.stroke, fill: '#fffaf3' });
  const filter = card({ x: 548, y: r.y + 50, w: 210, h: 110, title: 'Video filter', sub: ['scale to the rung,', 'setsar=1'], tone: 'network' });
  const enc = card({ x: 800, y: r.y + 40, w: 330, h: 140, title: 'libx264, main profile', sub: [`CRF ${r.crf}, maxrate ${r.max},`, `bufsize ${r.buf}, GOP 6 s,`, 'keyframe at t = 6n'], tone: 'compute' });
  const aac = chip({ x: 800, y: r.y + 196, w: 330, h: 44, label: `AAC-LC stereo ${r.aac}`, tone: 'plain' });
  const mux = card({ x: 1170, y: r.y + 50, w: 220, h: 150, title: 'HLS muxer', sub: ['hls_time 6, VOD,', 'AES-128 key info,', 'seg_%05d.ts'], tone: 'storage' });
  p.push(g.svg, filter.svg, enc.svg, aac.svg, mux.svg);
  p.push(edge([[filter.box.r, filter.box.cy], [enc.box.x, filter.box.cy]]));
  p.push(edge([[enc.box.r, filter.box.cy], [mux.box.x, filter.box.cy]]));
  p.push(edge([[aac.box.r, aac.box.cy], [1150, aac.box.cy], [1150, mux.box.b - 20], [mux.box.x, mux.box.b - 20]]));
  muxers.push({ filter, aac, mux });
}

const pack = card({ x: 1460, y: 340, w: 170, h: 180, title: 'Package', sub: ['peak and average', 'bandwidth from', 'real segments,', 'CODECS from SPS,', 'master last'], tone: 'network' });
p.push(pack.svg);

p.push(edge([[source.box.r, source.box.cy], [decode.box.x, source.box.cy]]));
// Giải mã tới chuỗi lọc và bộ mã hoá âm thanh của từng hàng
const FAN_X = 504;
for (const m of muxers) {
  p.push(edge([[decode.box.r, decode.box.cy], [FAN_X, decode.box.cy], [FAN_X, m.filter.box.cy], [m.filter.box.x, m.filter.box.cy]]));
  p.push(edge([[FAN_X, m.filter.box.cy], [FAN_X, m.aac.box.cy], [m.aac.box.x, m.aac.box.cy]], { arrow: true }));
}
for (const m of muxers) {
  p.push(edge([[m.mux.box.r, m.mux.box.cy], [1440, m.mux.box.cy], [1440, pack.box.cy], [pack.box.x, pack.box.cy]]));
}

p.push(text(['All outputs share forced keyframes at absolute 6-second marks, closed GOPs of the real frame rate,',
  'no scene-cut keyframes and 8-bit 4:2:0 video, so every rung cuts segments at the same instants.'],
  40, 920, { size: 15.5, anchor: 'start', fill: PALETTE.muted, lineHeight: 20 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('23-ffmpeg-graph', svg, 3);
console.log(`23-ffmpeg-graph -> ${(out.bytes / 1024).toFixed(0)} KB`);
