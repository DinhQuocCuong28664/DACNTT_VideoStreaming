/**
 * Hình 6.x — Time-to-First-Frame theo vị trí người xem, trước và sau khi chuyển sang PriceClass_All.
 *
 * Thay cho bảng `tab:ttff-multiregion`. Cái bảng chỉ làm đậm, và hình cho thấy rõ, là São Paulo: 1196 ms
 * khi còn PriceClass_200 (edge ở Cape Town) rồi 36,79 ms sau khi sửa, trong khi mọi nơi khác đều quanh
 * 55 ms. Trục tuyến tính (không phải log) để chênh lệch gấp hai mươi mốt lần hiện đúng tỉ lệ.
 *
 * Chỉ vẽ những ô mà bảng có số. Lượt đo thứ hai (PriceClass_All) chỉ đo lại bốn nơi: hai nơi bị đổi
 * edge (São Paulo, Sydney) và hai nơi đối chứng (Dublin, Singapore). N. Virginia và Tokyo có mặt trong
 * tệp JSON của lượt hai nhưng với đúng số liệu của lượt một, tức là chép sang chứ không đo lại, nên
 * script nhận ra bằng cách so từng chữ số và bỏ qua; ô đó trong bảng là "n/a".
 *
 * Số liệu: qoe-ttff-multiregion.json (byRegion là PriceClass_All, priceClass200 là lượt trước) và, cho
 * dòng người dùng thật ở TP.HCM, qoe-ttff-cloudfront.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  W, FONT, COLOR, T, line, block, linear, axisX, legendRow, document_, write, f2,
} from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, '..', '..', 'results');
const read = (f) => JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8'));

const multi = read('qoe-ttff-multiregion.json');
const hcm = read('qoe-ttff-cloudfront.json');

const LOCATIONS = [
  ['us-east-1', 'N. Virginia, United States'],
  ['eu-west-1', 'Dublin, Ireland'],
  ['ap-southeast-1', 'Singapore'],
  ['ap-northeast-1', 'Tokyo, Japan'],
  ['ap-southeast-2', 'Sydney, Australia'],
  ['sa-east-1', 'São Paulo, Brazil'],
];
const edge = (rec) => rec.servedByPop[0].split('-')[0];

const rows = LOCATIONS.map(([region, name]) => {
  const old = multi.priceClass200[region] ?? null;
  const now = multi.byRegion[region] ?? null;
  const carried = old && now && JSON.stringify(old.ttff) === JSON.stringify(now.ttff);
  return {
    name,
    p200: old ? { ms: old.ttff.medianMs, edge: edge(old) } : null,
    all: now && !carried ? { ms: now.ttff.medianMs, edge: edge(now) } : null,
  };
});
// Dòng đo từ kết nối của người dùng thật: cùng cấu hình PriceClass_200, edge SGN50.
const consumer = { name: 'Ho Chi Minh City, consumer connection', p200: { ms: hcm.ttff.medianMs, edge: 'SGN50' }, all: null };

const LABEL_R = 280;
const X0 = 296, X1 = 690;
const x = linear(0, 1250, X0, X1);
const BAR_H = 15;
const GAP = 4;
const ROW = 50;
const TOP = 74;

const all = [...rows, consumer];
const sepAfter = rows.length;                    // đường ngăn giữa sáu vị trí AWS và dòng người dùng thật
const yOf = (i) => TOP + i * ROW + (i >= sepAfter ? 14 : 0);
const lastY = yOf(all.length - 1) + ROW;
const AXIS_Y = lastY + 6;
const H = AXIS_Y + 58;

const body = [];
body.push(legendRow(12, 26, [
  { color: COLOR.grey, label: 'PriceClass_200' },
  { color: COLOR.dark, label: 'PriceClass_All' },
], { gap: 28 }).svg);
body.push(T('Median time to first frame', 12, 56, { size: FONT.small, weight: 'bold', anchor: 'start' }));
body.push(axisX({ scale: x, ticks: [0, 250, 500, 750, 1000, 1250], y: AXIS_Y, top: TOP - 8, title: 'Milliseconds' }));

all.forEach((r, i) => {
  const y = yOf(i);
  const top = y + (ROW - (2 * BAR_H + GAP)) / 2;
  const edges = [r.p200?.edge, r.all?.edge].filter(Boolean);
  const edgeText = r.p200 && r.all && r.p200.edge !== r.all.edge ? `${r.p200.edge} → ${r.all.edge}` : [...new Set(edges)].join(', ');
  body.push(T(r.name, LABEL_R, y + ROW / 2 - 2, { size: FONT.small, weight: 'bold', anchor: 'end' }));
  body.push(T(`edge ${edgeText}`, LABEL_R, y + ROW / 2 + 14, { size: FONT.tiny, anchor: 'end', fill: COLOR.muted }));
  [[r.p200, COLOR.grey, 0], [r.all, COLOR.dark, 1]].forEach(([v, color, slot]) => {
    if (!v) return;
    const by = top + slot * (BAR_H + GAP);
    body.push(block(x(0), by, x(v.ms) - x(0), BAR_H, color));
    body.push(T(`${f2(v.ms)} ms`, x(v.ms) + 8, by + 12, { size: FONT.small, weight: v.ms > 1000 ? 'bold' : 'normal', anchor: 'start' }));
  });
});
const ySep = yOf(sepAfter) - 8;
body.push(line(12, ySep, X1 + 60, ySep, { stroke: COLOR.axis, dash: '4 4' }));

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('12-chart-ttff-regions', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes', out.copied ? '(copied to report/images)' : '');
