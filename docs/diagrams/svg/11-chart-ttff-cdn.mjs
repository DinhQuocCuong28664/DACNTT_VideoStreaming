/**
 * Hình 6.x — Time-to-First-Frame ở ba cấu hình phân phối, và nơi thời gian được tiết kiệm.
 *
 * Thay cho hai bảng `tab:ttff-results` và `tab:ttff-cloudfront`. Câu chuyện của mục này là một lỗi
 * ngược: CDN chậm hơn gốc 2,9 lần vì đi vòng sang châu Âu, rồi sau khi sửa nhanh hơn gốc 2,3 lần.
 * Mới chỉ có hai trong ba con số đó nằm trong bảng; con số thứ ba (727,69 ms) chỉ nằm trong văn
 * xuôi. Hình đặt cả ba lên cùng một thang.
 *
 * Bảng trên: trung vị TTFF toàn phần. Bảng dưới: trung vị của từng giai đoạn, chỉ cho hai cấu hình
 * có dữ liệu theo giai đoạn. Trung vị từng giai đoạn không cộng lại đúng bằng trung vị toàn phần
 * (trung vị không có tính cộng), nên hình không xếp chồng chúng.
 *
 * Số liệu:
 *   - qoe-ttff.json             gốc S3, không CDN (20 mẫu)
 *   - qoe-ttff-cloudfront.json  CloudFront, edge SGN50 (20 mẫu), sau khi đổi PriceClass
 *   - 727,69 ms qua edge MRS53 (châu Âu): chỉ còn trong văn xuôi chương 6 và thông điệp commit b952fe3;
 *     tệp JSON của lượt đo đó bị ghi đè bởi lượt đo sau khi sửa, nên không có số liệu theo giai đoạn
 *     cho cấu hình này và hình không vẽ nó ở bảng dưới.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  W, FONT, COLOR, T, block, linear, axisX, legendRow, document_, write, f2,
} from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, '..', '..', 'results');
const read = (f) => JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8'));

const origin = read('qoe-ttff.json');
const cdn = read('qoe-ttff-cloudfront.json');
const MARSEILLE_MEDIAN_MS = 727.69;

const CONFIGS = [
  { key: 'origin', title: 'S3 origin, no CDN', sub: 'served straight from the bucket', color: COLOR.grey },
  { key: 'mrs', title: 'CloudFront, Marseille edge', sub: 'PriceClass_100 (Europe, North America)', color: COLOR.orange },
  { key: 'sgn', title: 'CloudFront, Ho Chi Minh City edge', sub: 'PriceClass_200 (adds Asia)', color: COLOR.dark },
];
const total = { origin: origin.ttff.medianMs, mrs: MARSEILLE_MEDIAN_MS, sgn: cdn.ttff.medianMs };

const STAGES = [
  { label: 'Master playlist', get: (d) => d.breakdown.masterPlaylist.medianMs },
  { label: 'Rendition playlist', get: (d) => d.breakdown.subPlaylist.medianMs },
  { label: 'First segment', get: (d) => d.breakdown.firstSegment.medianMs },
];

const LABEL_R = 292;       // mép phải cột nhãn
const X0 = 308;
const BAR_H = 26;

const body = [];
body.push(legendRow(12, 26, CONFIGS.map((c) => ({ color: c.color, label: c.title })), { gap: 20, size: FONT.tiny }).svg);

// ── Bảng trên: TTFF toàn phần ─────────────────────────────────────────────────
const A_HEAD = 76;
const A_ROW = 54;
const A_TOP = A_HEAD + 22;
const xa = linear(0, 800, X0, 740);
const A_AXIS = A_TOP + CONFIGS.length * A_ROW + 2;
body.push(T('Median time to first frame', 12, A_HEAD, { size: FONT.body, weight: 'bold', anchor: 'start' }));
body.push(axisX({ scale: xa, ticks: [0, 200, 400, 600, 800], y: A_AXIS, top: A_TOP - 8, title: 'Milliseconds' }));
CONFIGS.forEach((c, i) => {
  const top = A_TOP + i * A_ROW + (A_ROW - BAR_H) / 2;
  body.push(T(c.title, LABEL_R, top + 11, { size: FONT.small, weight: 'bold', anchor: 'end' }));
  body.push(T(c.sub, LABEL_R, top + 27, { size: FONT.tiny, anchor: 'end', fill: COLOR.muted }));
  body.push(block(xa(0), top, xa(total[c.key]) - xa(0), BAR_H, c.color));
  body.push(T(`${f2(total[c.key])} ms`, xa(total[c.key]) + 8, top + 18, { size: FONT.small, weight: 'bold', anchor: 'start' }));
});

// ── Bảng dưới: trung vị theo giai đoạn ────────────────────────────────────────
const B_HEAD = A_AXIS + 92;
const B_TOP = B_HEAD + 24;
const GROUP = 78;
const SUB_H = 22;
const xb = linear(0, 100, X0, 740);
const B_AXIS = B_TOP + STAGES.length * GROUP + 2;
body.push(T('Median time of each stage, where it was measured', 12, B_HEAD, { size: FONT.body, weight: 'bold', anchor: 'start' }));
body.push(axisX({ scale: xb, ticks: [0, 20, 40, 60, 80, 100], y: B_AXIS, top: B_TOP - 8, title: 'Milliseconds' }));
STAGES.forEach((s, i) => {
  const gTop = B_TOP + i * GROUP;
  body.push(T(s.label, LABEL_R, gTop + GROUP / 2 + 5, { size: FONT.small, weight: 'bold', anchor: 'end' }));
  [['origin', origin], ['sgn', cdn]].forEach(([key, data], j) => {
    const v = s.get(data);
    const c = CONFIGS.find((k) => k.key === key);
    const top = gTop + 10 + j * (SUB_H + 6);
    body.push(block(xb(0), top, xb(v) - xb(0), SUB_H, c.color));
    body.push(T(`${f2(v)} ms`, xb(v) + 8, top + 16, { size: FONT.small, anchor: 'start' }));
  });
});

const H = B_AXIS + 58;
const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('11-chart-ttff-cdn', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes', out.copied ? '(copied to report/images)' : '');
