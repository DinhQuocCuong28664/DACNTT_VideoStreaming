/**
 * Hình 2.3 — Hai mô hình tính toán cho một tải chuyển mã bùng phát.
 *
 * Phần đáng giá nhất của sơ đồ là hai thanh tỉ lệ ở dưới. Mục 2.2.1 và mục 6.6
 * đều nêu con số hiệu suất sử dụng 0,5%, nhưng một con số trong bảng không gây
 * ấn tượng gì; vẽ trên cùng một thang thời gian thì dải gần như trống của mô
 * hình serverless nói ngay được điều mà cả đoạn văn phải giải thích.
 *
 * Hai bảng xếp dọc chứ không đặt cạnh nhau. Đặt cạnh nhau thì khung hình rộng
 * gấp đôi, và khi thu vừa bề rộng vùng chữ thì nhãn chỉ còn khoảng 4pt, dưới
 * mức đọc được khi in. Xếp dọc giữ được hình đứng, không phải xoay ngang.
 *
 * Sơ đồ cố ý KHÔNG chép lại phần lập luận trong thân bài. Mục 2.2.1 đã giải
 * thích vì sao trần năng lực là cứng và vì sao lợi thế mất dần khi mức sử dụng
 * tăng; hình chỉ mang phần so sánh.
 *
 * Số liệu lấy từ Bảng 6.7, cùng giả định: 300 video mỗi tháng, trung bình năm
 * phút, tổng cộng 3,75 giờ xử lý thật.
 */
import { card, chip, group, bar, text, document_, write, PALETTE } from './render.mjs';

const W = 748;
const H = 968;
const p = [];

const M = 36;                 // lề trái
const PANEL_W = W - M * 2;
const HOURS_IN_MONTH = 730;
const USEFUL_HOURS = 3.75;

/** Vẽ một bảng mô hình. */
function panel(spec) {
  const {
    y, label, stroke, fill, iconName, cardTitle, cardSub, cardTone,
    facts, statLabel, statValue, cost,
  } = spec;

  p.push(group({ x: M, y, w: PANEL_W, h: 292, label, stroke, fill }).svg);

  p.push(card({
    x: M + 26, y: y + 46, w: 190, h: 126, iconName, iconSize: 34,
    title: cardTitle, sub: [cardSub], tone: cardTone,
  }).svg);

  facts.forEach((f, i) => {
    p.push(chip({
      x: M + 236, y: y + 46 + i * 44, w: PANEL_W - 262, h: 38,
      label: f, tone: i === facts.length - 1 ? cardTone : 'plain',
    }).svg);
  });

  p.push(text(statLabel, M + 26, y + 212, { size: 13, anchor: 'start', fill: PALETTE.muted }));
  p.push(text(statValue, M + 26, y + 240, { size: 25, weight: 'bold', anchor: 'start', fill: stroke }));
  p.push(text('Monthly compute cost', M + 288, y + 212, { size: 13, anchor: 'start', fill: PALETTE.muted }));
  p.push(text(cost, M + 288, y + 240, { size: 25, weight: 'bold', anchor: 'start', fill: stroke }));
}

panel({
  y: 36,
  label: 'Always-on cluster provisioned for peak load',
  stroke: PALETTE.secret.stroke, fill: '#fef8f7',
  iconName: 'aws-ec2', cardTitle: 'Amazon EC2', cardSub: 'c5.xlarge, always on', cardTone: 'compute',
  facts: [
    'Runs continuously for 730 hours a month',
    'Only 3.75 of those hours do real work',
    'A burst above capacity is queued or rejected',
  ],
  statLabel: 'Utilisation', statValue: 'about 0.5 %', cost: 'USD 124.10',
});

panel({
  y: 360,
  label: 'Serverless containers, the model used in this project',
  stroke: PALETTE.network.stroke, fill: '#f6fbf6',
  iconName: 'aws-fargate', cardTitle: 'AWS Batch', cardSub: 'on Fargate Spot', cardTone: 'network',
  facts: [
    'No compute exists between uploads',
    'A container starts per job, then terminates',
    'The queue absorbs the burst, up to max_vcpus',
  ],
  statLabel: 'Billed for', statValue: 'vCPU-seconds', cost: 'USD 0.05',
});

// ── Hai thanh trên cùng một thang thời gian ─────────────────────────────────
const barsY = 754;
const BAR_X = M + 128;
const BAR_W = W - BAR_X - M;

p.push(text('Compute hours billed per month, both on the same scale',
  M, barsY - 46, { size: 15, weight: 'bold', anchor: 'start' }));

p.push(text('Always-on', M, barsY + 20, { size: 13.5, weight: 'bold', anchor: 'start' }));
p.push(bar({
  x: BAR_X, y: barsY, w: BAR_W, h: 28, fraction: 1,
  fillColor: PALETTE.secret.stroke, valueLabel: '730 hours billed',
}).svg);

// Phần thực sự làm việc. Viền mảnh để dải này đọc ra là một đại lượng được đo
// chứ không phải một chỗ hở do vẽ thiếu; ở thang này nó rộng chưa tới ba pixel,
// và chính điều đó là nội dung của hình.
const usefulW = Math.max(BAR_W * (USEFUL_HOURS / HOURS_IN_MONTH), 2.5);
const tickX = (BAR_X + usefulW / 2).toFixed(1);
p.push(`<rect x="${BAR_X}" y="${barsY}" width="${usefulW.toFixed(2)}" height="28" fill="#ffffff" stroke="#7d2018" stroke-width="1.2"/>`);
p.push(`<path d="M ${tickX} ${barsY + 28} L ${tickX} ${barsY + 46}" stroke="#7d2018" stroke-width="1.2"/>`);
p.push(text('3.75 h of useful work', BAR_X + usefulW / 2 + 6, barsY + 60,
  { size: 12.5, anchor: 'start', fill: PALETTE.muted }));

p.push(text('Serverless', M, barsY + 108, { size: 13.5, weight: 'bold', anchor: 'start' }));
p.push(bar({
  x: BAR_X, y: barsY + 88, w: BAR_W, h: 28, fraction: USEFUL_HOURS / HOURS_IN_MONTH,
  fillColor: PALETTE.network.stroke, valueLabel: '3.75 hours billed',
}).svg);

p.push(text(
  ['The saving comes entirely from the empty part of the upper bar.',
   'Figures from Table 6.7.'],
  M, barsY + 156, { size: 12.5, anchor: 'start', fill: PALETTE.muted, lineHeight: 17 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('07-compute-models', svg, 3);
console.log(`07-compute-models -> ${(out.bytes / 1024).toFixed(0)} KB`);
