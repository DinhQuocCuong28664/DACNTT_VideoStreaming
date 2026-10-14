/**
 * Hình 4.4 — Năm collection phục vụ kiểm duyệt và vận hành.
 *
 * Tách khỏi hình 4.3 vì hai lý do. Một là kích thước: thêm năm bảng vào cùng
 * một canvas đẩy chữ in ra xuống dưới 6pt. Hai là ý nghĩa: ba bảng User, Video,
 * Comment mô tả nền tảng, còn năm bảng này mô tả việc giám sát nền tảng, và có
 * chung một tính chất mà hình lõi không có (chỉ thêm, không sửa; một bản ghi
 * cho mỗi quyết định hay mỗi video).
 *
 * Khoá ngoại không vẽ thành đường nối: mọi `video` trỏ về VIDEO, mọi trường
 * người dùng trỏ về USER, và vẽ mười hai đường chéo qua năm bảng chỉ làm rối.
 * Quan hệ được nói bằng một khối chữ ở góc phải.
 *
 * Bề rộng 1462 px in ra 247 mm (xoay ngang), nên chữ 13,5 px là khoảng 6,5pt.
 */
import { entity, text, document_, write, PALETTE, TYPE } from './render.mjs';

Object.assign(TYPE, {
  entityKey: 13.5,
  entityRow: 13.5,
});

const W = 1462;
const H = 846;
const p = [];

const COL_W = 450;
const X1 = 40;
const X2 = X1 + COL_W + 16;
const X3 = X2 + COL_W + 16;
const OPTS = { w: COL_W, colType: 96, colName: 160, colKey: 40 };

// ── APPEAL ─────────────────────────────────────────────────────────────
const appeal = entity({
  ...OPTS, x: X1, y: 44, name: 'APPEAL', tone: 'network',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'ObjectId', name: 'video', key: 'FK' },
    { type: 'ObjectId', name: 'owner', key: 'FK' },
    { type: 'string', name: 'message', note: 'at most 500 chars' },
    { type: 'Date', name: 'decisionAt', note: 'unique with video' },
    { type: 'string', name: 'decisionSource', note: 'auto / admin' },
    { type: 'string', name: 'status', note: 'open/upheld/rejected' },
    { type: 'ObjectId', name: 'resolvedBy', key: 'FK' },
    { type: 'Date', name: 'resolvedAt' },
    { type: 'string', name: 'resolutionNote' },
    { type: 'Date', name: 'createdAt' },
    { type: 'Date', name: 'updatedAt' },
  ],
});
p.push(appeal.svg);

// ── ROLE_CHANGE ────────────────────────────────────────────────────────
const roleChange = entity({
  ...OPTS, x: X1, y: appeal.box.b + 44, name: 'ROLE_CHANGE', tone: 'storage',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'ObjectId', name: 'target', key: 'FK' },
    { type: 'ObjectId', name: 'actor', key: 'FK' },
    { type: 'string', name: 'from', note: 'role before' },
    { type: 'string', name: 'to', note: 'role after' },
    { type: 'Date', name: 'createdAt', note: 'append only' },
  ],
});
p.push(roleChange.svg);

// ── MODERATION_EVENT ───────────────────────────────────────────────────
const event = entity({
  ...OPTS, x: X2, y: 44, name: 'MODERATION_EVENT', tone: 'compute',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'ObjectId', name: 'video', key: 'FK' },
    { type: 'ObjectId', name: 'actor', key: 'FK' },
    { type: 'string', name: 'actorRole', note: 'role at the time' },
    { type: 'string', name: 'decision', note: 'approve / block' },
    { type: 'string', name: 'action', note: 'approve/block/restore' },
    { type: 'string', name: 'fromStatus', note: 'verdict before' },
    { type: 'string', name: 'toStatus', note: 'verdict after' },
    { type: 'string', name: 'autoStatus', note: 'machine verdict' },
    { type: 'string', name: 'outcome', note: 'six classes' },
    { type: 'string', name: 'reasonCode', note: 'closed list' },
    { type: 'string', name: 'note' },
    { type: 'object[]', name: 'labels', note: 'evidence' },
    { type: 'Date', name: 'createdAt', note: 'append only' },
  ],
});
p.push(event.svg);

// ── AUDIT_SAMPLE ───────────────────────────────────────────────────────
const audit = entity({
  ...OPTS, x: X2, y: event.box.b + 44, name: 'AUDIT_SAMPLE', tone: 'secret',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'ObjectId', name: 'video', key: 'UK', note: 'once per video' },
    { type: 'ObjectId', name: 'drawnBy', key: 'FK' },
    { type: 'string', name: 'batch', note: 'one draw' },
    { type: 'string', name: 'status', note: 'pending/pass/fail' },
    { type: 'ObjectId', name: 'labeledBy', key: 'FK' },
    { type: 'Date', name: 'labeledAt' },
    { type: 'string', name: 'note' },
    { type: 'Date', name: 'createdAt' },
    { type: 'Date', name: 'updatedAt' },
  ],
});
p.push(audit.svg);

// ── REPORT ─────────────────────────────────────────────────────────────
const report = entity({
  ...OPTS, x: X3, y: 44, name: 'REPORT', tone: 'network',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'ObjectId', name: 'video', key: 'FK' },
    { type: 'ObjectId', name: 'reporter', key: 'FK' },
    { type: 'string', name: 'reason', note: 'eight reasons' },
    { type: 'string', name: 'details', note: 'at most 500 chars' },
    { type: 'string', name: 'status', note: 'three states' },
    { type: 'ObjectId', name: 'resolvedBy', key: 'FK' },
    { type: 'Date', name: 'resolvedAt' },
    { type: 'Date', name: 'createdAt' },
    { type: 'Date', name: 'updatedAt' },
  ],
});
p.push(report.svg);

// ── Quan hệ, nói bằng chữ ───────────────────────────────────────────────
p.push(text([
  'Foreign keys',
  '',
  'video  →  VIDEO._id',
  'owner, reporter, actor, drawnBy,',
  'labeledBy, resolvedBy, target  →  USER._id',
  '',
  'Constraints',
  '',
  'MODERATION_EVENT, ROLE_CHANGE: append only',
  'APPEAL: one per video and decision time',
  'AUDIT_SAMPLE: one per video',
  'REPORT: one open report per viewer and video',
], X3, report.box.b + 62, { size: 15, anchor: 'start', fill: PALETTE.muted }));

p.push(text(
  ['PK primary key  ·  UK unique key  ·  FK foreign key  ·  [] array'],
  X1, H - 22, { size: 13.5, anchor: 'start', fill: PALETTE.muted }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('09-moderation-erd', svg, 3);
console.log(`09-moderation-erd -> ${(out.bytes / 1024).toFixed(0)} KB, lowest box at ${Math.max(roleChange.box.b, audit.box.b)}`);
