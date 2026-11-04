/**
 * Hình 4.2 — State machine của workflow chuyển mã (infra/modules/workflow/main.tf).
 *
 * Vẽ đúng tên state trong định nghĩa ASL. Cột giữa là đường thành công; khối Parallel chứa hai
 * nhánh: phân tích và mã hoá (đơn hoặc chia đoạn). Mọi Catch đi về MarkFailed ở cột phải bằng
 * nét đứt đỏ; luật Retry ghi ở khung dưới cùng thay vì gắn nhãn lên từng cạnh.
 */
import { card, group, edge, legend, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();

Object.assign(TYPE, { cardTitle: 18.5, cardSub: 16.5, cardSubLH: 20, groupLabel: 17, edgeLabel: 16.5, legendLabel: 16.5 });

const W = 1180;
const H = 1320;
const p = [];
const RED = PALETTE.secret.stroke;

const mark = card({ x: 300, y: 50, w: 220, h: 100, title: 'MarkProcessing', sub: ['Lambda status: key,', 'state PROCESSING'], tone: 'compute' });
const still = card({ x: 300, y: 190, w: 220, h: 72, title: 'Still there?', tone: 'plain' });
const gone = card({ x: 590, y: 190, w: 200, h: 72, title: 'Gone', sub: ['succeed, no work'], tone: 'plain' });
const probe = card({ x: 300, y: 302, w: 220, h: 100, title: 'Probe', sub: ['Lambda: ffprobe,', 'rungs, chunk plan'], tone: 'compute' });
p.push(mark.svg, still.svg, gone.svg, probe.svg);

const par = group({ x: 50, y: 446, w: 810, h: 474, label: 'Process (Parallel)', stroke: PALETTE.network.stroke, fill: '#f6fbf6' });
p.push(par.svg);
const analyse = card({ x: 80, y: 520, w: 200, h: 124, title: 'Analyse', sub: ['Batch, main queue,', '2 vCPU: screening,', 'previews'], tone: 'compute' });
const path = card({ x: 340, y: 500, w: 200, h: 72, title: 'Chunked?', tone: 'plain' });
const encode = card({ x: 340, y: 620, w: 200, h: 112, title: 'Encode', sub: ['Batch, main queue,', '4 or 8 vCPU'], tone: 'compute' });
const hasAudio = card({ x: 600, y: 500, w: 200, h: 72, title: 'Has audio?', tone: 'plain' });
const audio = card({ x: 600, y: 620, w: 200, h: 112, title: 'Audio', sub: ['Batch, main queue,', '1 vCPU'], tone: 'compute' });
const chunks = card({ x: 600, y: 776, w: 200, h: 120, title: 'Chunks', sub: ['array job of N,', 'bulk queue, 4 vCPU'], tone: 'compute' });
const stitch = card({ x: 340, y: 790, w: 200, h: 96, title: 'Stitch', sub: ['Lambda: playlists,', 'master last'], tone: 'compute' });
p.push(analyse.svg, path.svg, encode.svg, hasAudio.svg, audio.svg, chunks.svg, stitch.svg);

const publish = card({ x: 300, y: 966, w: 220, h: 100, title: 'Publish', sub: ['Lambda status: READY', 'or SCHEDULED'], tone: 'compute' });
const done = card({ x: 300, y: 1110, w: 220, h: 60, title: 'Done', tone: 'network' });
const failed = card({ x: 900, y: 600, w: 230, h: 120, title: 'MarkFailed', sub: ['ERROR with reason,', 'owner told, alert,', 'temp files removed'], tone: 'secret' });
const fail = card({ x: 900, y: 770, w: 230, h: 64, title: 'Failed', tone: 'secret' });
p.push(publish.svg, done.svg, failed.svg, fail.svg);

// Đường thành công
p.push(edge([[mark.box.cx, mark.box.b], [mark.box.cx, still.box.y]]));
p.push(edge([[still.box.r, still.box.cy], [gone.box.x, still.box.cy]], { label: 'no' }));
p.push(edge([[still.box.cx, still.box.b], [still.box.cx, probe.box.y]], { label: 'yes', labelDx: 26, labelDy: 6 }));
p.push(edge([[probe.box.cx, probe.box.b], [probe.box.cx, 488], [analyse.box.cx, 488], [analyse.box.cx, analyse.box.y]]));
p.push(edge([[path.box.cx, probe.box.b], [path.box.cx, path.box.y]]));
p.push(edge([[path.box.cx, path.box.b], [path.box.cx, encode.box.y]], { label: 'no', labelDx: 24, labelDy: 6 }));
p.push(edge([[path.box.r, path.box.cy], [hasAudio.box.x, path.box.cy]], { label: 'yes' }));
p.push(edge([[hasAudio.box.cx, hasAudio.box.b], [hasAudio.box.cx, audio.box.y]], { label: 'yes', labelDx: 26, labelDy: 6 }));
p.push(edge([[hasAudio.box.r, hasAudio.box.cy], [815, hasAudio.box.cy], [815, chunks.box.cy], [chunks.box.r, chunks.box.cy]], { label: 'no', labelDx: 10, labelAt: 0.3 }));
p.push(edge([[audio.box.cx, audio.box.b], [audio.box.cx, chunks.box.y]]));
p.push(edge([[chunks.box.x, stitch.box.cy], [stitch.box.r, stitch.box.cy]]));
p.push(edge([[probe.box.cx, par.box.b], [probe.box.cx, publish.box.y]], { arrow: true }));
p.push(edge([[publish.box.cx, publish.box.b], [publish.box.cx, done.box.y]]));
p.push(edge([[failed.box.cx, failed.box.b], [failed.box.cx, fail.box.y]]));

// Catch: mọi lỗi còn lại sau Retry
const CATCH = { dashed: true, color: RED };
p.push(edge([[mark.box.r, 80], [1060, 80], [1060, failed.box.y]], CATCH));
p.push(edge([[probe.box.r, 330], [1000, 330], [1000, failed.box.y]], CATCH));
p.push(edge([[par.box.r, 660], [failed.box.x, 660]], CATCH));
p.push(edge([[publish.box.r, 984], [870, 984], [870, 690], [failed.box.x, 690]], CATCH));

// Luật thử lại
const rules = group({ x: 600, y: 1008, w: 540, h: 250, label: 'Retry before Catch', stroke: '#98a2b3', fill: '#fafbfc', dash: '5 4' });
p.push(rules.svg);
[
  'Lambda tasks: service errors and throttling,',
  '   6 attempts, wait 2 s and double',
  'Batch submit: API errors and throttling,',
  '   5 attempts, wait 5 s and double',
  'Every Batch job: 3 attempts; exit code 3',
  '   (cannot succeed) ends it at once',
  'Whole execution: 24-hour timeout',
].forEach((line, i) => p.push(text(line, 620, 1058 + i * 27, { size: 16.5, anchor: 'start', fill: PALETTE.ink })));

p.push(legend(50, 1290, [
  { label: 'Next state' },
  { label: 'Catch States.ALL to MarkFailed', dashed: true, color: RED },
]));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('21-state-machine', svg, 3);
console.log(`21-state-machine -> ${(out.bytes / 1024).toFixed(0)} KB`);
