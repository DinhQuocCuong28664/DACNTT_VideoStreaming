/**
 * Hình 6.x — Chất lượng phát của ba nguồn có độ phức tạp hình ảnh khác nhau, trên ba hồ sơ mạng.
 *
 * Thay cho phần chính của bảng `tab:qoe-multisource` (16 dòng). Kết luận của mục là độ phức tạp không
 * xếp thứ tự kết quả: ở fast 3G nguồn "vừa" tệ nhất chứ không phải nguồn "cao", ở slow 3G cả ba nằm
 * trong một điểm phần trăm, ở không giới hạn cả ba bằng không. Chỉ nhìn được khi ba cột cạnh nhau.
 *
 * Hai bảng: tỉ lệ tái đệm (cột là trung bình của năm lượt chạy, râu là lượt tệ nhất) và bitrate trung
 * bình. Số lượt có tái đệm và độ trễ khởi động giữ ở Phụ lục B, vì chúng không đổi kết luận.
 *
 * Số liệu: qoe-comparison.json, các số làm tròn đúng như bảng (hai chữ số cho phần trăm, nguyên cho kbit/s).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  W, FONT, COLOR, T, line, block, linear, axisX, legendRow, document_, write,
} from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cmp = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'results', 'qoe-comparison.json'), 'utf8'));

const SOURCES = [
  { key: 'thap', label: 'Low', color: '#bcd8e6' },
  { key: 'trung', label: 'Medium', color: '#6aa7c4' },
  { key: 'cao', label: 'High', color: '#1d5876' },
];
const PROFILES = [
  { key: 'unthrottled', label: 'Unthrottled' },
  { key: 'fast3g', label: 'Fast 3G' },
  { key: 'slow3g', label: 'Slow 3G' },
];
const profile = (srcKey, profKey) => cmp.videos.find((v) => v.label === srcKey).profiles[profKey];

const PROF_X = 12;         // tên hồ sơ mạng
const SRC_R = 148;         // mép phải của tên nguồn
const X0 = 164, X1 = 580;
const BAR_H = 16;
const ROW = 25;
const GROUP_GAP = 12;
const GROUP_H = SOURCES.length * ROW;

const body = [];
body.push(legendRow(12, 26, [
  ...SOURCES.map((s) => ({ color: s.color, label: `${s.label} complexity` })),
], { gap: 26 }).svg);

let y = 64;

/** Một bảng gồm ba nhóm (hồ sơ mạng) × ba dòng (nguồn). `draw(prof, src, rowTop)` vẽ phần dữ liệu của dòng. */
function panel(title, scale, ticks, axisTitle, fmtTick, draw) {
  body.push(T(title, 12, y, { size: FONT.body, weight: 'bold', anchor: 'start' }));
  y += 18;
  const top = y;
  const height = PROFILES.length * GROUP_H + (PROFILES.length - 1) * GROUP_GAP;
  const axisY = top + height + 8;
  body.push(axisX({ scale, ticks, y: axisY, top: top - 4, fmt: fmtTick, title: axisTitle }));
  PROFILES.forEach((p, gi) => {
    const gTop = top + gi * (GROUP_H + GROUP_GAP);
    body.push(T(p.label, PROF_X, gTop + GROUP_H / 2 + 5, { size: FONT.small, weight: 'bold', anchor: 'start' }));
    SOURCES.forEach((s, si) => {
      const rTop = gTop + si * ROW + (ROW - BAR_H) / 2;
      body.push(T(s.label, SRC_R, rTop + 13, { size: FONT.small, anchor: 'end', fill: COLOR.muted }));
      draw(profile(s.key, p.key), s, rTop);
    });
  });
  y = axisY + 86;
}

const pct = (v) => (v * 100).toFixed(2);

// ── Tái đệm ───────────────────────────────────────────────────────────────────
const xr = linear(0, 15, X0, X1);
panel('Rebuffering ratio: bar is the mean of five runs, whisker reaches the worst run', xr, [0, 5, 10, 15], 'Percent of playback time',
  (v) => `${v}%`, (d, s, rTop) => {
    const mean = d.rebufferingRatioMean;
    const max = d.rebufferingRatioMax;
    body.push(block(xr(0), rTop, xr(mean * 100) - xr(0), BAR_H, s.color));
    let labelX = xr(mean * 100) + 8;
    if (max > mean) {
      const a = xr(mean * 100), b = xr(max * 100), mid = rTop + BAR_H / 2;
      body.push(line(a, mid, b, mid, { stroke: COLOR.ink, width: 1.2 }));
      body.push(line(b, mid - 5, b, mid + 5, { stroke: COLOR.ink, width: 1.2 }));
      labelX = b + 8;
    }
    body.push(T(`${pct(mean)}%  (worst run ${pct(max)}%)`, labelX, rTop + 13, { size: FONT.small, anchor: 'start' }));
  });

// ── Bitrate trung bình ────────────────────────────────────────────────────────
const xk = linear(0, 2000, X0, X1);
panel('Average bitrate received', xk, [0, 500, 1000, 1500, 2000], 'kbit/s', (v) => String(v), (d, s, rTop) => {
  const kbps = Math.round(d.averageBitrateBps / 1000);
  body.push(block(xk(0), rTop, xk(kbps) - xk(0), BAR_H, s.color));
  body.push(T(String(kbps), xk(kbps) + 8, rTop + 13, { size: FONT.small, anchor: 'start' }));
});

const H = y - 14;
const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('13-chart-qoe-sources', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes', out.copied ? '(copied to report/images)' : '');
