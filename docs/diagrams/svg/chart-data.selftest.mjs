/**
 * Kiểm tra mọi con số trên sáu biểu đồ (hình 11 đến 16) khớp với bảng tương ứng ở Phụ lục B.
 *
 * Biểu đồ thay thế bảng trong chương 6, và bảng gốc được giữ ở Phụ lục B để đọc số chính xác. Nếu hai bên
 * lệch nhau thì báo cáo tự mâu thuẫn, mà lỗi kiểu đó không có gì báo: LaTeX vẫn dịch sạch. Bài kiểm này đọc
 * thẳng chữ trong tệp SVG đã dựng và các ô của bảng trong tệp .tex rồi so từng số. Nó cũng đếm số nhãn số
 * trên hình, để bắt cả trường hợp hình có thêm hoặc thiếu một giá trị.
 *
 *   node --test docs/diagrams/svg/chart-data.selftest.mjs
 *
 * Phải dựng hình trước (node docs/diagrams/svg/1x-chart-*.mjs) và, với ba hình đo chuyển mã, chạy
 * scripts/results/build-report-tables.py để các tệp trong report/generated/ mới.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/** Mọi đoạn chữ trong một tệp SVG, theo thứ tự xuất hiện. */
const svgTexts = (name) =>
  [...read(`docs/diagrams/svg/${name}.svg`).matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)]
    .map((m) => m[1].replace(/&amp;/g, '&').trim())
    .filter(Boolean);

const clean = (c) => c
  .replace(/\\textbf\{([^}]*)\}/g, '$1')
  .replace(/\\textit\{([^}]*)\}/g, '$1')
  .replace(/\$[^$]*\$/g, '')
  .replace(/\\,/g, ' ')
  .replace(/\\%/g, '%')
  .replace(/\\\\/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Các dòng của bảng có nhãn `label` ở Phụ lục B, mỗi dòng là mảng ô đã làm sạch. Nạp cả tệp sinh ra qua \input. */
function rowsOf(label) {
  let s = read('report/appendices/appendixB.tex');
  const at = s.indexOf(`\\label{tab:${label}}`);
  assert.ok(at >= 0, `Phụ lục B không có bảng ${label}`);
  s = s.slice(at, s.indexOf('\\end{table}', at));
  const input = s.match(/\\input\{([^}]+)\}/);
  if (input) s = read(`report/${input[1]}`);
  return s.split('\n')
    .filter((l) => l.includes('&') && /\\\\\s*$/.test(l))
    .map((l) => l.split('&').map(clean));
}
const rowStartingWith = (rows, first) => {
  const r = rows.find((x) => x[0].startsWith(first));
  assert.ok(r, `không có dòng "${first}"`);
  return r;
};
const countMatching = (texts, re) => texts.filter((t) => re.test(t)).length;

test('hình 16: thời gian READY của từng video khớp bảng concurrent-four', () => {
  const texts = svgTexts('16-chart-concurrent-four');
  const rows = rowsOf('concurrent-four').filter((r) => /^\d+$/.test(r[0]));
  assert.equal(rows.length, 8);
  for (const r of rows) assert.ok(texts.includes(`${r[4]} min`), `thiếu ${r[4]} min (VCPU ${r[0]}, video ${r[1]})`);
  assert.equal(countMatching(texts, /^\d+\.\d min$/), rows.length);
});

test('hình 15: các số của video 4 giờ khớp bảng four-hour-breakdown', () => {
  const texts = svgTexts('15-chart-four-hour');
  const rows = rowsOf('four-hour-breakdown');
  const ready = rowStartingWith(rows, 'Upload complete');          // [nhãn, 16 vCPU, 8 vCPU]
  const chunks = rowStartingWith(rows, '48 chunk jobs');
  const compute = rowStartingWith(rows, 'Compute');
  for (const col of [1, 2]) {
    assert.ok(texts.includes(`${ready[col]} min`), `thiếu READY ${ready[col]}`);
    assert.ok(texts.includes(`${compute[col]} vCPU-hours`), `thiếu ${compute[col]} vCPU-hours`);
    assert.ok(texts.some((t) => t.startsWith(`${chunks[col]} min`)), `thiếu pha chunk ${chunks[col]}`);
  }
  assert.equal(countMatching(texts, /^\d+\.\d min$/), 2);
});

test('hình 14: READY và vCPU-giây của mười lượt đo khớp bảng chunk-config', () => {
  const texts = svgTexts('14-chart-chunk-config');
  const rows = rowsOf('chunk-config').filter((r) => /^\d+ \d+/.test(r[0]) && r.length === 7);
  assert.equal(rows.length, 10);
  for (const r of rows) {
    assert.ok(texts.includes(r[5]), `thiếu READY ${r[5]}`);
    if (r[6] !== 'n/a') assert.ok(texts.includes(r[6]), `thiếu vCPU-giây ${r[6]}`);
  }
  assert.equal(countMatching(texts, /^\d+\.\d$/), rows.length);
});

test('hình 11: trung vị TTFF toàn phần và theo giai đoạn khớp hai bảng ttff', () => {
  const texts = svgTexts('11-chart-ttff-cdn');
  const base = rowsOf('ttff-results');
  const cdn = rowsOf('ttff-cloudfront');
  const medianOf = (rows, name) => rowStartingWith(rows, name)[2];           // cột MEDIAN
  const expected = [
    medianOf(base, 'Total TTFF'), medianOf(cdn, 'Total TTFF'),
    ...['Master playlist', 'Rendition playlist', 'First segment'].flatMap((n) => [medianOf(base, n), medianOf(cdn, n)]),
  ];
  for (const v of expected) assert.ok(texts.includes(`${v} ms`), `thiếu ${v} ms`);
  // Số thứ ba (qua Marseille) chỉ có trong văn xuôi chương 6, không có trong bảng nào.
  assert.ok(read('report/chapters/chap6.tex').includes('727.69'), 'chương 6 không còn nhắc 727.69');
  assert.ok(texts.includes('727.69 ms'));
  assert.equal(countMatching(texts, /^[\d.]+ ms$/), expected.length + 1);
});

test('hình 12: trung vị theo vị trí khớp bảng ttff-multiregion', () => {
  const texts = svgTexts('12-chart-ttff-regions');
  const rows = rowsOf('ttff-multiregion').filter((r) => r.length === 6 && !/LOCATION|^$/.test(r[0]));
  assert.equal(rows.length, 7);
  const expected = [];
  for (const r of rows) {
    if (r[2] !== 'n/a') expected.push(r[2]);                                  // PRICECLASS_200
    if (r[4] !== 'n/a') expected.push(r[4]);                                  // PRICECLASS_ALL
  }
  for (const v of expected) assert.ok(texts.includes(`${v} ms`), `thiếu ${v} ms`);
  assert.equal(countMatching(texts, /^[\d.]+ ms$/), expected.length);
});

test('hình 13: tái đệm và bitrate khớp bảng qoe-multisource', () => {
  const texts = svgTexts('13-chart-qoe-sources');
  const rows = rowsOf('qoe-multisource');
  // Mỗi nhóm hồ sơ bắt đầu bằng một dòng \multicolumn; ở đây nó đã bị lọc vì không có "&", nên duyệt theo thứ tự.
  const mean = rows.filter((r) => r[0] === 'Rebuffering ratio, mean');
  const max = rows.filter((r) => r[0] === 'Rebuffering ratio, max');
  const kbps = rows.filter((r) => r[0] === 'Average bitrate (kbit/s)');
  assert.equal(mean.length, 3);
  assert.equal(max.length, 3);
  assert.equal(kbps.length, 3);
  for (let g = 0; g < 3; g++) {
    for (let s = 1; s <= 3; s++) {
      const label = `${mean[g][s]}  (worst run ${max[g][s]})`;
      assert.ok(texts.includes(label), `thiếu "${label}"`);
      assert.ok(texts.includes(kbps[g][s]), `thiếu bitrate ${kbps[g][s]}`);
    }
  }
  // Số nhãn tái đệm đúng bằng chín; nhãn bitrate không đếm được vì lẫn với nhãn trục (0, 500, ..., 2000).
  assert.equal(countMatching(texts, /\(worst run /), 9);
});
