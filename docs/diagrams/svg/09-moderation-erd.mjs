/**
 * Hình 4.10 — Các collection của kiểm duyệt và vận hành (api/src/features/moderation.ts,
 * community.ts, api/src/db.ts). Cùng quy ước với Hình 4.9: không vẽ cạnh, ghi chú của khoá ngoại
 * nêu collection được trỏ tới, khoá duy nhất có điều kiện ghi rõ điều kiện.
 */
import { entity, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { entityKey: 14.5, entityRow: 14.5, entityName: 17 });

const W = 1620;
const H = 700;
const p = [];
const OPTS = { w: 500, colType: 100, colName: 160, colKey: 40 };
const X = [40, 560, 1080];

const report = entity({ ...OPTS, x: X[0], y: 44, name: 'reports', tone: 'network', rows: [
  { type: 'ObjectId', name: 'video', key: 'FK', note: '→ videos' },
  { type: 'ObjectId', name: 'reporter', key: 'UK', note: '→ users; one open each' },
  { type: 'string', name: 'reason', note: 'eight reasons' },
  { type: 'string', name: 'details', note: 'at most 500 characters' },
  { type: 'string', name: 'status', note: 'open, dismissed, actioned' },
  { type: 'ObjectId', name: 'resolvedBy', key: 'FK', note: '→ users' },
] });
const creport = entity({ ...OPTS, x: X[0], y: report.box.b + 40, name: 'commentReports', tone: 'network', rows: [
  { type: 'ObjectId', name: 'comment', key: 'FK', note: '→ comments' },
  { type: 'ObjectId', name: 'reporter', key: 'UK', note: '→ users; one open each' },
  { type: 'string', name: 'reason', note: 'same eight reasons' },
  { type: 'string', name: 'status', note: 'open, dismissed, actioned' },
  { type: 'string', name: 'commentText', note: 'kept when removed' },
] });

const event = entity({ ...OPTS, x: X[1], y: 44, name: 'moderationEvents', tone: 'compute', rows: [
  { type: 'ObjectId', name: 'video', key: 'FK', note: '→ videos' },
  { type: 'ObjectId', name: 'actor', key: 'FK', note: '→ users, with actorRole' },
  { type: 'string', name: 'decision', note: 'approve or block' },
  { type: 'string', name: 'action', note: 'four actions' },
  { type: 'string', name: 'fromStatus', note: 'with toStatus' },
  { type: 'string', name: 'machineStatus', note: 'verdict before people' },
  { type: 'string', name: 'outcome', note: 'six outcome classes' },
  { type: 'string', name: 'reasonCode', note: 'closed list' },
  { type: 'string[]', name: 'labels', note: 'top screening labels' },
  { type: 'Date', name: 'createdAt', note: 'append only' },
] });
const role = entity({ ...OPTS, x: X[1], y: event.box.b + 40, name: 'roleChanges', tone: 'storage', rows: [
  { type: 'ObjectId', name: 'user', key: 'FK', note: '→ users' },
  { type: 'string', name: 'from, to', note: 'roles before and after' },
  { type: 'ObjectId', name: 'by', key: 'FK', note: '→ users; append only' },
] });

const appeal = entity({ ...OPTS, x: X[2], y: 44, name: 'appeals', tone: 'secret', rows: [
  { type: 'ObjectId', name: 'video', key: 'UK', note: '→ videos; one open each' },
  { type: 'ObjectId', name: 'owner', key: 'FK', note: '→ users' },
  { type: 'string', name: 'message', note: '10 to 500 characters' },
  { type: 'string', name: 'status', note: 'open, upheld, rejected' },
  { type: 'string', name: 'resolution', note: 'note of the operator' },
] });
const sample = entity({ ...OPTS, x: X[2], y: appeal.box.b + 40, name: 'auditSamples', tone: 'secret', rows: [
  { type: 'ObjectId', name: 'video', key: 'UK', note: '→ videos; one pending' },
  { type: 'string', name: 'status', note: 'pending, pass, fail' },
  { type: 'ObjectId', name: 'createdBy', key: 'FK', note: '→ users (administrator)' },
  { type: 'ObjectId', name: 'labelledBy', key: 'FK', note: '→ users (operator)' },
] });

p.push(report.svg, creport.svg, event.svg, role.svg, appeal.svg, sample.svg);
p.push(text('UK unique index, partial where the note says so  ·  FK reference; the note names the collection',
  40, H - 24, { size: 15, anchor: 'start', fill: PALETTE.muted }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('09-moderation-erd', svg, 3);
console.log(`09-moderation-erd -> ${(out.bytes / 1024).toFixed(0)} KB`);
