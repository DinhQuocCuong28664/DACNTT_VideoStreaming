/**
 * Hình 4.1 — Kiến trúc tổng thể và ranh giới triển khai.
 *
 * Nhãn viết tiếng Anh cho khớp phần chữ của báo cáo.
 *
 * Sơ đồ cố ý vẽ đúng ranh giới thật chứ không vẽ một khối AWS chung chung:
 * phân phối video nằm ở một tài khoản AWS thứ hai (mục 5.5 giải thích vì sao),
 * còn MongoDB Atlas và Cloudflare là dịch vụ bên thứ ba nằm ngoài mọi tài khoản
 * AWS của dự án. Gộp tất cả vào một hộp sẽ che mất đúng những điều mà chương 5
 * và chương 7 phải giải thích dài dòng bằng lời.
 *
 * Các cạnh phải đi từ cột bên thứ ba sang tài khoản AWS đều chạy trong khoảng
 * trống giữa hai khối, và mỗi cạnh được cấp một "làn" dọc riêng trong hằng số
 * LANE. Không có làn riêng thì các đường chồng lên nhau và nhãn của chúng đè cả
 * lên tiêu đề của khối bên dưới, đó là lỗi của bản dựng đầu tiên.
 *
 * Mười bốn bước của luồng dữ liệu là HUY HIỆU SỐ trên cạnh, không phải nhãn chữ, và nghĩa của
 * từng bước nằm trong bảng "Numbered steps" dưới cột bên trái. Bản dùng nhãn chữ có 15 trong
 * 18 nhãn đè lên viền thẻ hoặc khung, vì nhãn rộng 66 đến 314px mà khe giữa hai thẻ chỉ 36 đến
 * 46px, và hành lang giữa cột bên thứ ba với tài khoản AWS chỉ rộng 136px mà chứa bốn làn dọc
 * cùng năm nhãn. Huy hiệu tròn 26px đặt vừa mọi khe; chỗ đặt do placeBadges() trong render.mjs
 * tự chọn, và enableLayoutCheck() làm bước dựng hỏng nếu có gì đè lên nhau.
 */
import { card, group, edge, legend, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

// Dựng hình mà có nhãn hoặc cạnh đè lên thẻ, viền khung hay tiêu đề khung thì báo lỗi.
enableLayoutCheck();

// Canvas rong 1740px, in ra 247mm (xoay ngang, an het chieu cao trang), nen mot
// px canvas chi con 0,142mm tren giay. O co chu cu, nhan cua cac cang nho nhat
// la 13px chi in ra 5,2pt, nho hon ca chu chan trang. Muon dat 6,2pt (2,19mm)
// thi can 15,4px, lam tron thanh 15,5.
// Trần của hình này là 15,5px, không phải do chữ mà do khe giữa các thẻ trong
// tầng xử lý chỉ rộng 36px. Nhãn cạnh có nền trắng rộng bằng
// `số_ký_tự × font × 0,554 + 14`, nên ở 15,5px thì "8  trigger" rộng 92px, vừa
// đủ tràn sang phần đệm hai bên mà chưa chạm tiêu đề thẻ. Lên 17,5px thì nó rộng
// 101px và cắt mất chữ "S" của Amazon SQS lẫn chữ "A" của AWS Lambda.
//
// Muốn nâng tiếp thì phải giãn lại khoảng cách các thẻ trong tầng xử lý, mà giãn
// thì khung bao rộng ra và cỡ chữ in ra lại tụt xuống, nên phải thu hẹp bề ngang
// từng thẻ để bù. Đó là việc sửa bố cục, không phải đổi một con số.
Object.assign(TYPE, {
  cardTitle: 18,
  cardSub: 15.5,
  cardSubLH: 19,
  groupLabel: 16.5,
  edgeLabel: 15.5,
  legendLabel: 15.5,
});

const W = 1740;
const H = 1012;
const p = [];

/** Bốn làn dọc trong khoảng trống giữa cột bên thứ ba và tài khoản AWS. */
const LANE = { upload: 300, presign: 324, metadata: 348, ready: 276 };

// ── Cột 1: người xem và hạ tầng bên thứ ba ──────────────────────────────────
const third = group({
  x: 40, y: 96, w: 216, h: 514, label: 'Outside AWS',
  stroke: '#98a2b3', fill: '#fafbfc', dash: '5 4',
});
p.push(third.svg);

const browser = card({
  x: 62, y: 138, w: 172, h: 120, iconName: 'react', iconSize: 34,
  title: "Viewer's browser", sub: ['React SPA + HLS.js'], tone: 'network',
});
const cloudflare = card({
  x: 62, y: 300, w: 172, h: 116, iconName: 'cloudflare', iconSize: 34,
  title: 'Cloudflare', sub: ['DNS and edge TLS'], tone: 'plain',
});
const atlas = card({
  x: 62, y: 458, w: 172, h: 128, iconName: 'mongodb', iconSize: 34,
  title: 'MongoDB Atlas', sub: ['Users, videos,', 'comments'], tone: 'storage',
});
p.push(browser.svg, cloudflare.svg, atlas.svg);

// ── Tài khoản AWS chính ─────────────────────────────────────────────────────
const main = group({
  x: 392, y: 72, w: 900, h: 828, label: 'Primary AWS account', iconName: 'aws',
});
p.push(main.svg);

const delivery = group({
  x: 418, y: 112, w: 848, h: 156, label: 'Delivery tier',
  stroke: PALETTE.network.stroke, fill: '#f6fbf6',
});
p.push(delivery.svg);

const cfWeb = card({
  x: 458, y: 146, w: 196, h: 114, iconName: 'aws-cloudfront', iconSize: 32,
  title: 'CloudFront', sub: ['zelostech.site'], tone: 'network',
});
const s3Web = card({
  x: 752, y: 146, w: 196, h: 114, iconName: 'aws-s3', iconSize: 32,
  title: 'Amazon S3', sub: ['Static site hosting'], tone: 'storage',
});
p.push(cfWeb.svg, s3Web.svg);

const app = group({
  x: 418, y: 306, w: 848, h: 190, label: 'Application tier',
  stroke: PALETTE.compute.stroke, fill: '#fffaf3',
});
p.push(app.svg);

const api = card({
  x: 458, y: 342, w: 208, h: 136, iconName: 'aws-ec2', iconSize: 32,
  title: 'Amazon EC2', sub: ['Node.js + Express', 'behind nginx'], tone: 'compute',
});
const secrets = card({
  x: 752, y: 342, w: 196, h: 136, iconName: 'aws-secrets-manager', iconSize: 32,
  title: 'Secrets Manager', sub: ['DB URI, JWT key,', 'cookie signing key'], tone: 'secret',
});
const canary = card({
  x: 982, y: 342, w: 196, h: 136, iconName: 'aws-cloudwatch', iconSize: 32,
  title: 'CloudWatch', sub: ['Canary probes the site', 'every 5 minutes'], tone: 'plain',
});
p.push(api.svg, secrets.svg, canary.svg);

const proc = group({
  x: 418, y: 522, w: 848, h: 350, label: 'Processing tier (event-driven)',
  stroke: PALETTE.storage.stroke, fill: '#f5fafc',
});
p.push(proc.svg);

const s3Raw = card({
  x: 450, y: 562, w: 178, h: 116, iconName: 'aws-s3', iconSize: 30,
  title: 'S3 Raw Bucket', sub: ['uploaded source file'], tone: 'storage',
});
const sqs = card({
  x: 664, y: 562, w: 178, h: 116, iconName: 'aws-sqs', iconSize: 30,
  title: 'Amazon SQS', sub: ['Transcode queue', 'plus dead letter queue'], tone: 'network',
});
const lambda = card({
  x: 878, y: 562, w: 178, h: 116, iconName: 'aws-lambda', iconSize: 30,
  title: 'AWS Lambda', sub: ['Job Submitter'], tone: 'compute',
});
const ecr = card({
  x: 1072, y: 562, w: 172, h: 116, iconName: 'docker', iconSize: 30,
  title: 'Amazon ECR', sub: ['transcoder image'], tone: 'plain',
});
const batch = card({
  x: 878, y: 720, w: 178, h: 140, iconName: 'aws-batch', iconSize: 30,
  title: ['AWS Batch', 'on Fargate'], sub: ['FFmpeg, chunked for', 'long videos'], tone: 'compute',
});
const s3Proc = card({
  x: 572, y: 726, w: 190, h: 124, iconName: 'aws-s3', iconSize: 30,
  title: 'S3 Processed', sub: ['HLS segments', 'and thumbnails'], tone: 'storage',
});
p.push(s3Raw.svg, sqs.svg, lambda.svg, ecr.svg, batch.svg, s3Proc.svg);

// ── Tài khoản AWS thứ hai ───────────────────────────────────────────────────
const second = group({
  x: 1332, y: 300, w: 366, h: 300,
  label: 'Second AWS account', iconName: 'aws', stroke: '#8e6bb3', fill: '#faf7fd',
});
p.push(second.svg);

const cfVideo = card({
  x: 1364, y: 348, w: 302, h: 216, iconName: 'aws-cloudfront', iconSize: 38,
  title: ['CloudFront', 'cdn.zelostech.site'],
  sub: ['Origin Access Control', 'Signed Cookies', 'PriceClass_All'], tone: 'network',
});
p.push(cfVideo.svg);

// ── Cạnh nối ────────────────────────────────────────────────────────────────
// 1-2: người xem tới giao diện. Nhãn đặt trên đoạn dọc trong làn trống.
p.push(edge([[browser.box.cx, browser.box.b], [browser.box.cx, cloudflare.box.y]],
  { badge: 1 }));
p.push(edge([[cloudflare.box.r, 322], [LANE.upload, 322], [LANE.upload, 203], [cfWeb.box.x, 203]],
  { badge: 2 }));
p.push(edge([[cfWeb.box.r, cfWeb.box.cy], [s3Web.box.x, s3Web.box.cy]], { label: 'origin' }));

// 3-4: người xem tới API, API tới cơ sở dữ liệu
p.push(edge([[cloudflare.box.r, 380], [api.box.x, 380]], { badge: 3 }));
p.push(edge([[api.box.x, 440], [LANE.metadata, 440], [LANE.metadata, 492], [atlas.box.r, 492]],
  { badge: 4 }));
p.push(edge([[secrets.box.x, secrets.box.cy + 42], [api.box.r, api.box.cy + 42]],
  { dashed: true, label: 'secrets' }));

// 5-6: cấp URL rồi tải thẳng lên S3
p.push(edge([[api.box.cx, api.box.b], [api.box.cx, 508], [LANE.presign, 508], [LANE.presign, 214], [browser.box.r, 214]],
  { badge: 5, badgeAt: 0.72 }));
p.push(edge([[browser.box.r, 168], [LANE.upload, 168], [LANE.upload, 604], [s3Raw.box.x, 604]],
  { badge: 6, badgeAt: 0.69 }));

// 7-11: chuỗi chuyển mã
p.push(edge([[s3Raw.box.r, s3Raw.box.cy], [sqs.box.x, sqs.box.cy]], { badge: 7 }));
p.push(edge([[sqs.box.r, sqs.box.cy], [lambda.box.x, lambda.box.cy]], { badge: 8 }));
p.push(edge([[lambda.box.cx, lambda.box.b], [lambda.box.cx, batch.box.y]],
  { badge: 9 }));
p.push(edge([[ecr.box.cx, ecr.box.b], [ecr.box.cx, 788], [batch.box.r, 788]],
  { dashed: true, label: 'pull image', labelDy: -8 }));
p.push(edge([[s3Raw.box.cx, s3Raw.box.b], [s3Raw.box.cx, 700], [batch.box.x - 22, 700], [batch.box.x - 22, batch.box.cy], [batch.box.x, batch.box.cy]],
  { badge: 10, badgeAt: 0.42 }));
p.push(edge([[batch.box.x, batch.box.cy + 38], [s3Proc.box.r, s3Proc.box.cy + 38]], { badge: 11 }));

// 12: đánh dấu READY, chạy men theo đáy rồi lên MongoDB
p.push(edge([[batch.box.cx, batch.box.b], [batch.box.cx, 914], [LANE.ready, 914], [LANE.ready, atlas.box.cy], [atlas.box.r, atlas.box.cy]],
  { badge: 12, badgeAt: 0.8 }));

// Phân phối video
p.push(edge([[s3Proc.box.cx, s3Proc.box.b], [s3Proc.box.cx, 952], [1515, 952], [1515, second.box.b]],
  { label: 'origin, readable only by CloudFront', labelDy: -8, labelAt: 0.55 }));
p.push(edge([[api.box.cx + 60, api.box.y], [api.box.cx + 60, 287], [1306, 287], [1306, 404], [second.box.x, 404]],
  { badge: 13, badgeAt: 0.46 }));
p.push(edge([[cfVideo.box.x, cfVideo.box.y + 96], [1320, cfVideo.box.y + 96], [1320, 44], [206, 44], [206, browser.box.y]],
  { badge: 14 }));

// Bảng chú giải, đặt vào chỗ trống dưới cột bên thứ ba. Chữ ngắn để vừa khung rộng 216px ở 15,5px.
const STEPS = [
  'DNS lookup', 'load the interface', 'REST API call', 'metadata read/write', 'pre-signed URL',
  'upload to S3', 'S3 event', 'SQS to Lambda', 'SubmitJob', 'download source',
  'write HLS output', 'set status READY', 'signed cookies', 'serve signed HLS',
];
const KEY_Y = 632;
const KEY_ROW = 19;
const key = group({
  x: 40, y: KEY_Y, w: 216, h: 62 + (STEPS.length - 1) * KEY_ROW + 4, label: 'Numbered steps',
  stroke: '#98a2b3', fill: '#fafbfc', dash: '5 4',
});
p.push(key.svg);
STEPS.forEach((label, i) => {
  const y = KEY_Y + 58 + i * KEY_ROW;
  p.push(text(String(i + 1), 78, y, { size: TYPE.cardSub, weight: 'bold', anchor: 'end', fill: '#334155' }));
  p.push(text(label, 88, y, { size: TYPE.cardSub, anchor: 'start', fill: PALETTE.ink }));
});

p.push(legend(44, 980, [
  { label: 'Request flow' },
  { label: 'Configuration / image pull', dashed: true },
]));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('01-architecture-overview', svg, 3);
console.log(`01-architecture-overview -> ${(out.bytes / 1024).toFixed(0)} KB`);
