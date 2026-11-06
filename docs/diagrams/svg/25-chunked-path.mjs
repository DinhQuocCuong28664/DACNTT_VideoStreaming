/**
 * Hình 4.6 — Đường chia đoạn cho video dài (shared/src/media/chunkPlan.ts, transcoder/src/roles,
 * functions/src/stitch.ts). Ba tầng theo thời gian: kế hoạch cắt theo GOP, mã hoá (audio trước,
 * rồi array job các chunk chạy song song), ghép và kiểm tra. Số chunk ví dụ là của video 10 phút
 * đo trên prod (10 chunk của 60 s, 6 slot).
 */
import { card, chip, group, edge, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { cardTitle: 18, cardSub: 15.5, cardSubLH: 19, groupLabel: 16.5, edgeLabel: 15.5, chipLabel: 15, chipLabelLH: 18 });

const W = 1500;
const H = 1000;
const p = [];

// ── 1. Kế hoạch ─────────────────────────────────────────────────────────────
const plan = group({ x: 40, y: 40, w: 1420, h: 230, label: '1. Plan (probe step): cut the source on GOP boundaries', stroke: PALETTE.network.stroke, fill: '#f6fbf6' });
p.push(plan.svg);
const CH_W = 124, CH_GAP = 8, CH_X = 70, CH_Y = 96;
const labels = ['chunk 0', 'chunk 1', 'chunk 2', 'chunk 3', 'chunk 4', 'chunk 5', 'chunk 6', 'chunk 7', 'chunk 8', 'chunk 9'];
labels.forEach((l, i) => p.push(chip({ x: CH_X + i * (CH_W + CH_GAP), y: CH_Y, w: CH_W, h: 46, label: l, tone: i === 9 ? 'plain' : 'network' }).svg));
p.push(text([
  'Each chunk is a whole number of 6-second GOPs (10 to 50 GOPs, about three chunks per slot); a',
  'remainder under one GOP joins the previous chunk, and the last chunk is open-ended. Each window',
  'starts half a frame early so the seek never lands on the previous frame; windows meet exactly.',
], 70, 178, { size: 15.5, anchor: 'start', fill: PALETTE.ink, lineHeight: 22 }));

// ── 2. Mã hoá ───────────────────────────────────────────────────────────────
const enc = group({ x: 40, y: 310, w: 1420, h: 330, label: '2. Encode (Batch)', stroke: PALETTE.compute.stroke, fill: '#fffaf3' });
p.push(enc.svg);
const audio = card({ x: 70, y: 370, w: 300, h: 220, title: 'Audio job', sub: ['main queue, 1 vCPU', '', 'AAC-LC once per', 'bitrate of the plan', '(64k, 128k) for the', 'whole source, before', 'the chunks start'], tone: 'compute' });
p.push(audio.svg);
const arr = group({ x: 430, y: 356, w: 1000, h: 256, label: 'Chunk array job: N children, bulk queue, 4 vCPU each', stroke: PALETTE.compute.stroke, fill: '#fffdf8', dash: '4 4' });
p.push(arr.svg);
const kids = [];
for (let i = 0; i < 6; i += 1) {
  const k = card({ x: 456 + i * 160, y: 400, w: 146, h: 92, title: `child ${i}`, sub: ['all rungs'], tone: 'compute' });
  kids.push(k);
  p.push(k.svg);
}
p.push(text([
  'Six slots run at once (24 vCPU / 4); the rest wait in the queue. A child trims its exact window,',
  'copies the matching audio, offsets timestamps onto one timeline and writes c0007_000.ts … per rung.',
], 456, 530, { size: 15.5, anchor: 'start', fill: PALETTE.ink, lineHeight: 22 }));
p.push(text('A child that fails for good writes an abort marker; the others stop.', 456, 590, { size: 15.5, anchor: 'start', fill: PALETTE.muted }));

p.push(edge([[audio.box.r, 446], [kids[0].box.x, 446]]));

// ── 3. Ghép ────────────────────────────────────────────────────────────────
const st = group({ x: 40, y: 700, w: 1420, h: 260, label: '3. Stitch (Lambda) and publish', stroke: PALETTE.storage.stroke, fill: '#f5fafc' });
p.push(st.svg);
const check = card({ x: 70, y: 750, w: 420, h: 180, title: 'Check every chunk', sub: ['a result for every chunk of the plan;', 'all rungs cut at the same instants;', 'drift under 3 frames from the plan,', 'otherwise the video fails'], tone: 'storage' });
const join = card({ x: 560, y: 750, w: 420, h: 180, title: 'Join the playlists', sub: ['one media playlist per rung from the', 'chunk EXTINF lists, one EXT-X-KEY,', 'measured BANDWIDTH,', 'master playlist uploaded last'], tone: 'storage' });
const out = card({ x: 1050, y: 750, w: 380, h: 180, iconName: 'aws-s3', iconSize: 30, title: 'S3 processed', sub: ['an ordinary VOD package:', 'the player cannot tell it', 'was encoded in chunks'], tone: 'storage' });
p.push(check.svg, join.svg, out.svg);
p.push(edge([[check.box.r, check.box.cy], [join.box.x, check.box.cy]]));
p.push(edge([[join.box.r, join.box.cy], [out.box.x, join.box.cy]]));

// Nối giữa các tầng
p.push(edge([[700, plan.box.b], [700, arr.box.y]], { label: 'chunk plan', labelDx: 60, labelDy: 6, labelAt: 0.75 }));
p.push(edge([[300, plan.box.b], [300, audio.box.y]], { label: 'bitrates', labelDx: 48, labelDy: 6, labelAt: 0.75 }));
p.push(edge([[930, arr.box.b], [930, 670], [420, 670], [420, check.box.y]], { label: 'chunk results', labelAt: 0.5 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const res = write('25-chunked-path', svg, 3);
console.log(`25-chunked-path -> ${(res.bytes / 1024).toFixed(0)} KB`);
