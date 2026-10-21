/**
 * Hình 6.x — Bốn video 25 phút nộp cùng lúc, ở 8 và 16 vCPU: mỗi video một thanh thời gian.
 *
 * Thay cho bảng `tab:concurrent-four`. Điều bảng 8 dòng không cho thấy, và hình cho thấy ngay, là
 * hàng đợi: ở 8 vCPU các thanh xếp thành bậc thang vì video sau chỉ bắt đầu khi video trước nhả
 * chỗ, còn ở 16 vCPU các thanh chồng lên nhau nhiều hơn.
 *
 * Mỗi thanh có ba đoạn, đo từ lúc tệp tải lên xong:
 *   xám   từ 0 đến lúc chunk đầu tiên chạy (lập kế hoạch, mã hoá âm thanh, chờ chỗ trống)
 *   xanh  từ chunk đầu đến chunk cuối (đang mã hoá hình)
 *   cam   từ chunk cuối đến READY (bộ ghép playlist, ảnh bìa, kiểm duyệt)
 *
 * Số liệu: report/generated/chart-concurrent-four-videos.json, do build-report-tables.py sinh từ
 * đúng các lượt đo của bảng, nên hình và bảng (nay ở Phụ lục B) không lệch nhau.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  W, FONT, COLOR, T, block, linear, axisX, legendRow, document_, write, f1,
} from './chart.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '..', 'report', 'generated', 'chart-concurrent-four-videos.json'), 'utf8'));

const LABEL_R = 148;        // mép phải của cột nhãn "Video n"
const X0 = 162;             // vị trí 0 phút
const X1 = 724;             // vị trí 80 phút
const x = linear(0, 80, X0, X1);

const BAR_H = 22;
const ROW = 32;
const PANEL_HEAD = 30;
const PANEL_GAP = 26;
const TOP = 62;

const panels = [8, 16].map((cap) => ({ cap, rows: DATA.filter((r) => r.capacity_vcpu === cap).sort((a, b) => a.order - b.order) }));
const panelH = (p) => PANEL_HEAD + p.rows.length * ROW;
const axisY = TOP + panels.reduce((s, p) => s + panelH(p), 0) + PANEL_GAP * (panels.length - 1) + 4;
const H = axisY + 58;

const body = [];

// Chú giải ở đầu hình.
body.push(legendRow(X0 - 10, 30, [
  { color: COLOR.grey, label: 'Before the first chunk runs' },
  { color: COLOR.dark, label: 'Chunks encoding' },
  { color: COLOR.orange, label: 'Finalizing' },
], { gap: 24 }).svg);

// Lưới và trục trước, để cột nằm trên.
body.push(axisX({
  scale: x, ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80], y: axisY, top: TOP - 8,
  title: 'Minutes after the upload completed',
}));

let y = TOP;
for (const p of panels) {
  body.push(T(`${p.cap} vCPU`, 12, y + 17, { size: FONT.body, weight: 'bold', anchor: 'start' }));
  y += PANEL_HEAD;
  for (const r of p.rows) {
    const top = y + (ROW - BAR_H) / 2;
    body.push(T(`Video ${r.order}`, LABEL_R, top + 16, { size: FONT.small, anchor: 'end', fill: COLOR.muted }));
    body.push(block(x(0), top, x(r.start_min) - x(0), BAR_H, COLOR.grey));
    body.push(block(x(r.start_min), top, x(r.end_min) - x(r.start_min), BAR_H, COLOR.dark));
    body.push(block(x(r.end_min), top, x(r.ready_min) - x(r.end_min), BAR_H, COLOR.orange));
    body.push(T(`${f1(r.ready_min)} min`, x(r.ready_min) + 8, top + 16, { size: FONT.small, weight: 'bold', anchor: 'start' }));
    y += ROW;
  }
  y += PANEL_GAP;
}

const svg = document_({ width: W, height: H, body: body.join('') });
const out = write('16-chart-concurrent-four', svg);
console.log(`${W}x${H}`, out.bytes, 'bytes', out.copied ? '(copied to report/images)' : '');
