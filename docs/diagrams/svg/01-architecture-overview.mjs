/**
 * Hình 4.1 — Kiến trúc tổng thể v2 và ranh giới triển khai.
 *
 * Hai vùng thật: dịch vụ ngoài AWS (trình duyệt, Cloudflare, MongoDB Atlas) và một tài khoản AWS
 * giữ mọi thứ (CloudFront dời về đây ngày 2026-11-05, docs/ops/cdn-to-b.md). Tài khoản chia
 * bốn tầng theo đường đi của một video: API và dữ liệu, nhận và điều phối, tính toán serverless,
 * sự kiện; cột bên phải là tầng phân phối.
 *
 * Bước của luồng là HUY HIỆU SỐ, nghĩa nằm ở bảng "Numbered steps" dưới cột trái; nhãn chữ
 * không vừa các khe giữa thẻ. Mỗi cạnh phải đi qua hành lang giữa cột trái và tài khoản B có
 * một làn dọc riêng (LANE). enableLayoutCheck() làm bước dựng hỏng nếu có gì đè lên nhau.
 */
import { card, group, edge, legend, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();

Object.assign(TYPE, {
  cardTitle: 18,
  cardSub: 15.5,
  cardSubLH: 19,
  groupLabel: 16.5,
  edgeLabel: 15.5,
  legendLabel: 15.5,
});

const W = 1740;
const H = 1200;
const p = [];

/** Làn dọc trong hành lang giữa cột ngoài AWS và tài khoản B. */
const LANE = { api: 290, atlas: 316, status: 342, upload: 362 };
/** Làn dọc giữa tài khoản B và tài khoản A. */
const LANE_AB = 1400;

// ── Ngoài AWS ───────────────────────────────────────────────────────────────
const outside = group({ x: 40, y: 96, w: 216, h: 560, label: 'Outside AWS', stroke: '#98a2b3', fill: '#fafbfc', dash: '5 4' });
p.push(outside.svg);
const browser = card({ x: 62, y: 136, w: 172, h: 120, iconName: 'react', iconSize: 34, title: 'Browser', sub: ['React SPA + hls.js'], tone: 'network' });
const cloudflare = card({ x: 62, y: 300, w: 172, h: 140, iconName: 'cloudflare', iconSize: 34, title: 'Cloudflare', sub: ['DNS, TLS and', 'the API Worker'], tone: 'plain' });
const atlas = card({ x: 62, y: 484, w: 172, h: 150, iconName: 'mongodb', iconSize: 34, title: 'MongoDB Atlas', sub: ['documents and', 'Atlas Search'], tone: 'storage' });
p.push(browser.svg, cloudflare.svg, atlas.svg);

// ── Tài khoản B ─────────────────────────────────────────────────────────────
const acctB = group({ x: 380, y: 64, w: 1328, h: 1014, label: 'AWS account (ap-southeast-1): compute, storage and delivery', iconName: 'aws' });
p.push(acctB.svg);

const t1 = group({ x: 404, y: 104, w: 952, h: 172, label: 'API and data', stroke: PALETTE.compute.stroke, fill: '#fffaf3' });
const t2 = group({ x: 404, y: 320, w: 952, h: 190, label: 'Ingest and orchestration', stroke: PALETTE.network.stroke, fill: '#f6fbf6' });
const t3 = group({ x: 404, y: 540, w: 952, h: 214, label: 'Serverless compute', stroke: PALETTE.storage.stroke, fill: '#f5fafc' });
const t4 = group({ x: 404, y: 804, w: 952, h: 184, label: 'Events and notifications', stroke: '#8e6bb3', fill: '#faf7fd' });
p.push(t1.svg, t2.svg, t3.svg, t4.svg);

const api = card({ x: 430, y: 140, w: 200, h: 124, iconName: 'aws-lambda', iconSize: 30, title: 'API function', sub: ['Express 5,', 'reserved 80'], tone: 'compute' });
const ddb = card({ x: 690, y: 140, w: 190, h: 124, iconName: 'aws-dynamodb', iconSize: 30, title: 'DynamoDB', sub: ['limits, views,', 'progress, inbox'], tone: 'storage' });
const keys = card({ x: 940, y: 140, w: 180, h: 124, iconName: 'aws-s3', iconSize: 30, title: 'S3 keys', sub: ['AES-128 keys'], tone: 'secret' });
const webS3 = card({ x: 1160, y: 140, w: 170, h: 124, iconName: 'aws-s3', iconSize: 30, title: 'S3 web', sub: ['SPA bundle'], tone: 'storage' });
p.push(api.svg, ddb.svg, keys.svg, webS3.svg);

const raw = card({ x: 430, y: 360, w: 180, h: 132, iconName: 'aws-s3', iconSize: 30, title: 'S3 raw', sub: ['source files'], tone: 'storage' });
const sqs = card({ x: 660, y: 360, w: 180, h: 132, iconName: 'aws-sqs', iconSize: 30, title: 'SQS ingest', sub: ['with a', 'dead-letter queue'], tone: 'network' });
const starter = card({ x: 890, y: 360, w: 180, h: 132, iconName: 'aws-lambda', iconSize: 30, title: 'starter', sub: ['one execution', 'per upload'], tone: 'compute' });
const sfn = card({ x: 1120, y: 360, w: 210, h: 132, iconName: 'aws-step-functions', iconSize: 30, title: 'Step Functions', sub: ['transcode', 'workflow'], tone: 'network' });
p.push(raw.svg, sqs.svg, starter.svg, sfn.svg);

const proc = card({ x: 430, y: 580, w: 180, h: 150, iconName: 'aws-s3', iconSize: 30, title: 'S3 processed', sub: ['HLS package,', 'previews'], tone: 'storage' });
const fargate = card({ x: 660, y: 580, w: 180, h: 150, iconName: 'aws-fargate', iconSize: 30, title: 'Fargate', sub: ['Spot 24 vCPU,', 'On-Demand 24'], tone: 'compute' });
const batch = card({ x: 890, y: 580, w: 180, h: 150, iconName: 'aws-batch', iconSize: 30, title: 'AWS Batch', sub: ['main and', 'bulk queues'], tone: 'compute' });
const steps = card({ x: 1120, y: 580, w: 210, h: 150, iconName: 'aws-lambda', iconSize: 30, title: 'Lambda steps', sub: ['status, probe,', 'stitch'], tone: 'compute' });
p.push(proc.svg, fargate.svg, batch.svg, steps.svg);

const notifier = card({ x: 430, y: 840, w: 180, h: 132, iconName: 'aws-lambda', iconSize: 30, title: 'notifier', sub: ['subscriber inbox'], tone: 'compute' });
const eb = card({ x: 660, y: 840, w: 180, h: 132, iconName: 'aws-eventbridge', iconSize: 30, title: 'EventBridge', sub: ['progress,', 'VideoPublished'], tone: 'network' });
const sns = card({ x: 1120, y: 840, w: 210, h: 132, iconName: 'aws-sns', iconSize: 30, title: 'SNS alerts', sub: ['failed videos'], tone: 'secret' });
p.push(notifier.svg, eb.svg, sns.svg);

// ── Tầng phân phối ──────────────────────────────────────────────────────────
const acctA = group({ x: 1424, y: 250, w: 268, h: 470, label: 'Delivery (global)', stroke: '#8e6bb3', fill: '#faf7fd' });
p.push(acctA.svg);
const cfWeb = card({ x: 1452, y: 320, w: 232, h: 130, iconName: 'aws-cloudfront', iconSize: 32, title: 'CloudFront web', sub: ['zelostech.site'], tone: 'network' });
const cfMedia = card({ x: 1452, y: 500, w: 232, h: 190, iconName: 'aws-cloudfront', iconSize: 32, title: 'CloudFront media', sub: ['Origin Access Control,', 'signed query policy'], tone: 'network' });
p.push(cfWeb.svg, cfMedia.svg);

// ── Cạnh ────────────────────────────────────────────────────────────────────
// Người dùng tới API
p.push(edge([[browser.box.cx, browser.box.b], [browser.box.cx, cloudflare.box.y]], { badge: 1 }));
p.push(edge([[cloudflare.box.r, 344], [LANE.api, 344], [LANE.api, 182], [api.box.x, 182]], { badge: 2, badgeAt: 0.78 }));
p.push(edge([[api.box.x, 236], [LANE.atlas, 236], [LANE.atlas, 554], [atlas.box.r, 554]], { badge: 3, badgeAt: 0.6 }));
p.push(edge([[api.box.r, 182], [ddb.box.x, 182]], { badge: 4 }));
p.push(edge([[api.box.cx + 50, api.box.b], [api.box.cx + 50, 297], [keys.box.cx, 297], [keys.box.cx, keys.box.b]], { badge: 5, badgeAt: 0.5 }));

// Tải lên rồi chuỗi sự kiện
p.push(edge([[browser.box.r, 166], [LANE.upload, 166], [LANE.upload, 426], [raw.box.x, 426]], { badge: 6, badgeAt: 0.62 }));
p.push(edge([[raw.box.r, 426], [sqs.box.x, 426]], { badge: 7 }));
p.push(edge([[sqs.box.r, 426], [starter.box.x, 426]], { badge: 8 }));
p.push(edge([[starter.box.r, 426], [sfn.box.x, 426]], { badge: 9 }));
p.push(edge([[sfn.box.cx, sfn.box.b], [sfn.box.cx, steps.box.y]], { badge: 10 }));
p.push(edge([[sfn.box.x, 470], [1095, 470], [1095, 620], [batch.box.r, 620]], { badge: 11, badgeAt: 0.5 }));
p.push(edge([[batch.box.x, 655], [fargate.box.r, 655]], { badge: 12 }));
p.push(edge([[raw.box.cx, raw.box.b], [raw.box.cx, 524], [fargate.box.x + 40, 524], [fargate.box.x + 40, fargate.box.y]], { dashed: true, badge: 13, badgeAt: 0.5 }));
p.push(edge([[fargate.box.x, 655], [proc.box.r, 655]], { badge: 14 }));
p.push(edge([[fargate.box.cx, fargate.box.b], [fargate.box.cx, eb.box.y]], { badge: 15 }));
p.push(edge([[eb.box.r, 884], [1095, 884], [1095, 704], [steps.box.x, 704]], { badge: 16, badgeAt: 0.5 }));
p.push(edge([[steps.box.cx, steps.box.b], [steps.box.cx, 778], [LANE.status, 778], [LANE.status, 614], [atlas.box.r, 614]], { badge: 17, badgeAt: 0.35 }));
p.push(edge([[eb.box.x, 906], [notifier.box.r, 906]], { badge: 18 }));
p.push(edge([[steps.box.cx + 70, steps.box.b], [steps.box.cx + 70, sns.box.y]], { badge: 19 }));

// Phân phối
p.push(edge([[proc.box.x, 710], [392, 710], [392, 1024], [LANE_AB, 1024], [LANE_AB, 654], [cfMedia.box.x, 654]], { badge: 20, badgeAt: 0.55 }));
p.push(edge([[cfMedia.box.r, 574], [1726, 574], [1726, 40], [192, 40], [192, browser.box.y]], { badge: 21, badgeAt: 0.45 }));
p.push(edge([[218, browser.box.y], [218, 52], [cfWeb.box.r - 34, 52], [cfWeb.box.r - 34, cfWeb.box.y]], { badge: 22, badgeAt: 0.8 }));
p.push(edge([[cfWeb.box.x, 385], [LANE_AB, 385], [LANE_AB, 202], [webS3.box.r, 202]], { dashed: true, badge: 23, badgeAt: 0.5 }));

// ── Bảng bước ───────────────────────────────────────────────────────────────
const STEPS = [
  'DNS and API calls', 'Worker to API', 'documents, search', 'hot key-value data', 'read the AES key',
  'presigned upload', 'ObjectCreated event', 'message batch', 'StartExecution', 'probe, status, stitch',
  'submitJob.sync', 'run on Fargate', 'read the source', 'write the HLS', 'progress events',
  'to the status step', 'write video state', 'VideoPublished', 'failure alert', 'origin through OAC',
  'signed HLS requests', 'load the web app', 'web origin',
];
const KEY_Y = 680;
const KEY_ROW = 19;
const key = group({ x: 40, y: KEY_Y, w: 216, h: 62 + (STEPS.length - 1) * KEY_ROW + 4, label: 'Numbered steps', stroke: '#98a2b3', fill: '#fafbfc', dash: '5 4' });
p.push(key.svg);
STEPS.forEach((label, i) => {
  const y = KEY_Y + 58 + i * KEY_ROW;
  p.push(text(String(i + 1), 78, y, { size: TYPE.cardSub, weight: 'bold', anchor: 'end', fill: '#334155' }));
  p.push(text(label, 88, y, { size: TYPE.cardSub, anchor: 'start', fill: PALETTE.ink }));
});

p.push(legend(420, 1110, [
  { label: 'Request or event flow' },
  { label: 'Read access or origin', dashed: true },
]));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('01-architecture-overview', svg, 3);
console.log(`01-architecture-overview -> ${(out.bytes / 1024).toFixed(0)} KB`);
