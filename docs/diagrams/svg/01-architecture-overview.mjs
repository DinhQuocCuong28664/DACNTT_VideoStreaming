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
 */
import { card, group, edge, legend, document_, write, PALETTE, TYPE } from './render.mjs';

// Canvas rong 1740px, in ra 247mm (xoay ngang, an het chieu cao trang), nen mot
// px canvas chi con 0,142mm tren giay. O co chu cu, nhan cua cac cang nho nhat
// la 13px chi in ra 5,2pt, nho hon ca chu chan trang. Muon dat 6,2pt (2,19mm)
// thi can 15,4px, lam tron thanh 15,5.
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
  x: 40, y: 96, w: 216, h: 560, label: 'Client and third-party services',
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
  title: 'MongoDB Atlas', sub: ['Users, Videos,', 'Comments'], tone: 'storage',
});
p.push(browser.svg, cloudflare.svg, atlas.svg);

// ── Tài khoản AWS chính ─────────────────────────────────────────────────────
const main = group({
  x: 392, y: 72, w: 900, h: 828, label: 'Primary AWS account', iconName: 'aws',
});
p.push(main.svg);

const delivery = group({
  x: 418, y: 112, w: 848, h: 168, label: 'Delivery tier',
  stroke: PALETTE.network.stroke, fill: '#f6fbf6',
});
p.push(delivery.svg);

const cfWeb = card({
  x: 458, y: 146, w: 196, h: 114, iconName: 'aws-cloudfront', iconSize: 32,
  title: 'CloudFront', sub: ['zelostech.site'], tone: 'network',
});
const s3Web = card({
  x: 712, y: 146, w: 196, h: 114, iconName: 'aws-s3', iconSize: 32,
  title: 'Amazon S3', sub: ['Static website hosting'], tone: 'storage',
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
  x: 712, y: 342, w: 196, h: 136, iconName: 'aws-secrets-manager', iconSize: 32,
  title: 'Secrets Manager', sub: ['DB URI, JWT key,', 'cookie signing key'], tone: 'secret',
});
const canary = card({
  x: 962, y: 342, w: 196, h: 136, iconName: 'aws-cloudwatch', iconSize: 32,
  title: 'CloudWatch', sub: ['Canary calls the public', 'domain every 5 minutes'], tone: 'plain',
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
  title: 'Amazon SQS', sub: ['Transcode Queue', 'and Dead Letter Queue'], tone: 'network',
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
  title: ['AWS Batch', 'on Fargate'], sub: ['FFmpeg container'], tone: 'compute',
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
  { label: '1  DNS', labelDx: 40, labelDy: 4 }));
p.push(edge([[cloudflare.box.r, 322], [LANE.upload, 322], [LANE.upload, 203], [cfWeb.box.x, 203]],
  { label: '2  load the interface', labelDx: 0, labelDy: -8, labelAt: 0.5 }));
p.push(edge([[cfWeb.box.r, cfWeb.box.cy], [s3Web.box.x, s3Web.box.cy]], { label: 'origin' }));

// 3-4: người xem tới API, API tới cơ sở dữ liệu
p.push(edge([[cloudflare.box.r, 380], [api.box.x, 380]], { label: '3  REST API' }));
p.push(edge([[api.box.x, 440], [LANE.metadata, 440], [LANE.metadata, 492], [atlas.box.r, 492]],
  { label: '4  read / write metadata', labelDx: 0, labelDy: -8 }));
p.push(edge([[secrets.box.x, secrets.box.cy + 42], [api.box.r, api.box.cy + 42]],
  { dashed: true, label: 'inject secrets' }));

// 5-6: cấp URL rồi tải thẳng lên S3
p.push(edge([[api.box.cx, api.box.b], [api.box.cx, 508], [LANE.presign, 508], [LANE.presign, 214], [browser.box.r, 214]],
  { label: '5  issue pre-signed URL', labelDy: -8, labelAt: 0.5 }));
p.push(edge([[browser.box.r, 168], [LANE.upload, 168], [LANE.upload, 604], [s3Raw.box.x, 604]],
  { label: '6  upload straight to S3', labelDy: -8, labelAt: 0.62 }));

// 7-11: chuỗi chuyển mã
p.push(edge([[s3Raw.box.r, s3Raw.box.cy], [sqs.box.x, sqs.box.cy]], { label: '7  event' }));
p.push(edge([[sqs.box.r, sqs.box.cy], [lambda.box.x, lambda.box.cy]], { label: '8  trigger' }));
p.push(edge([[lambda.box.cx, lambda.box.b], [lambda.box.cx, batch.box.y]],
  { label: '9  SubmitJob', labelDx: 54 }));
p.push(edge([[ecr.box.cx, ecr.box.b], [ecr.box.cx, 788], [batch.box.r, 788]],
  { dashed: true, label: 'pull image', labelDy: -8 }));
p.push(edge([[s3Raw.box.cx, s3Raw.box.b], [s3Raw.box.cx, 700], [batch.box.x - 22, 700], [batch.box.x - 22, batch.box.cy], [batch.box.x, batch.box.cy]],
  { label: '10  download source', labelDy: -8, labelAt: 0.42 }));
p.push(edge([[batch.box.x, batch.box.cy + 38], [s3Proc.box.r, s3Proc.box.cy + 38]], { label: '11  write HLS' }));

// 12: đánh dấu READY, chạy men theo đáy rồi lên MongoDB
p.push(edge([[batch.box.cx, batch.box.b], [batch.box.cx, 914], [LANE.ready, 914], [LANE.ready, atlas.box.cy], [atlas.box.r, atlas.box.cy]],
  { label: '12  set status READY', labelDy: -8, labelAt: 0.42 }));

// Phân phối video
p.push(edge([[s3Proc.box.cx, s3Proc.box.b], [s3Proc.box.cx, 952], [1515, 952], [1515, second.box.b]],
  { label: 'origin, readable only by CloudFront', labelDy: -8, labelAt: 0.55 }));
p.push(edge([[api.box.cx + 60, api.box.y], [api.box.cx + 60, 293], [1306, 293], [1306, 404], [second.box.x, 404]],
  { label: '13  issue Signed Cookies', labelDy: -8, labelAt: 0.46 }));
p.push(edge([[cfVideo.box.x, cfVideo.box.y + 96], [1320, cfVideo.box.y + 96], [1320, 44], [148, 44], [148, browser.box.y]],
  { label: '14  serve HLS, signature required', labelDy: -8 }));

p.push(legend(44, 980, [
  { label: 'Request flow' },
  { label: 'Configuration / image pull', dashed: true },
]));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('01-architecture-overview', svg, 3);
console.log(`01-architecture-overview -> ${(out.bytes / 1024).toFixed(0)} KB`);
