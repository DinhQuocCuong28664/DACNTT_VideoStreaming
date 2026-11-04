/**
 * Hình 4.9 — Các collection nghiệp vụ của MongoDB (api/src/model, api/src/db.ts).
 *
 * Chín collection không vẽ cạnh nối: mười mấy đường quan hệ giữa ba cột sẽ cắt nhau và đè lên
 * bảng. Thay vào đó cột ghi chú của mỗi khoá ngoại ghi collection mà nó trỏ tới ("→ users"),
 * và khoá duy nhất ghi đúng tên index trong db.ts. Chỉ liệt kê các trường mà thiết kế bàn tới.
 */
import { entity, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { entityKey: 14.5, entityRow: 14.5, entityName: 17 });

const W = 1620;
const H = 940;
const p = [];
const COL_W = 500;
const OPTS = { w: COL_W, colType: 100, colName: 160, colKey: 40 };
const X = [40, 560, 1080];

const user = entity({ ...OPTS, x: X[0], y: 44, name: 'users', tone: 'storage', rows: [
  { type: 'ObjectId', name: '_id', key: 'PK' },
  { type: 'string', name: 'email', key: 'UK', note: 'email_unique' },
  { type: 'string', name: 'handle', key: 'UK', note: '@handle, handle_unique' },
  { type: 'string', name: 'passwordHash', note: 'bcrypt; null for Google only' },
  { type: 'string', name: 'googleSub', key: 'UK', note: 'partial unique' },
  { type: 'boolean', name: 'emailVerified' },
  { type: 'string', name: 'role', note: 'four roles' },
  { type: 'number', name: 'tokenVersion', note: 'bump revokes sessions' },
  { type: 'string', name: 'avatar, banner', note: 'screened images' },
  { type: 'object', name: 'counters', note: 'subscribers, videos' },
] });
const sub = entity({ ...OPTS, x: X[0], y: user.box.b + 40, name: 'subscriptions', tone: 'network', rows: [
  { type: 'ObjectId', name: 'subscriber', key: 'FK', note: '→ users' },
  { type: 'ObjectId', name: 'channel', key: 'FK', note: '→ users; pair unique' },
  { type: 'Date', name: 'createdAt' },
] });
const playlist = entity({ ...OPTS, x: X[0], y: sub.box.b + 40, name: 'playlists', tone: 'network', rows: [
  { type: 'ObjectId', name: '_id', key: 'PK' },
  { type: 'ObjectId', name: 'owner', key: 'FK', note: '→ users' },
  { type: 'string', name: 'kind', note: 'custom or watch_later' },
  { type: 'string', name: 'visibility', note: 'public, unlisted, private' },
  { type: 'object[]', name: 'items', key: 'FK', note: '→ videos, ordered' },
] });

const video = entity({ ...OPTS, x: X[1], y: 44, name: 'videos', tone: 'compute', rows: [
  { type: 'ObjectId', name: '_id', key: 'PK' },
  { type: 'ObjectId', name: 'owner', key: 'FK', note: '→ users' },
  { type: 'string', name: 'title, tags', note: 'searched with Atlas Search' },
  { type: 'string', name: 'status', note: 'five lifecycle states' },
  { type: 'string', name: 'step', note: 'with processingProgress' },
  { type: 'number', name: 'uploadVersion', note: 'names files and executions' },
  { type: 'string', name: 'visibility', note: 'public … password' },
  { type: 'string', name: 'audience', note: 'public or members' },
  { type: 'number', name: 'minTierLevel', note: 'members-only threshold' },
  { type: 'Date', name: 'publishAt', note: 'scheduled publication' },
  { type: 'string', name: 'hlsPath', note: 'master playlist' },
  { type: 'object[]', name: 'captions, chapters' },
  { type: 'object', name: 'moderation', note: 'status, source, labels' },
  { type: 'object', name: 'counters', note: 'views, likes, comments' },
] });
const comment = entity({ ...OPTS, x: X[1], y: video.box.b + 40, name: 'comments', tone: 'network', rows: [
  { type: 'ObjectId', name: '_id', key: 'PK' },
  { type: 'ObjectId', name: 'video', key: 'FK', note: '→ videos' },
  { type: 'ObjectId', name: 'author', key: 'FK', note: '→ users' },
  { type: 'ObjectId', name: 'parent', key: 'FK', note: '→ comments; one level' },
  { type: 'string', name: 'body', note: 'at most 1000 characters' },
  { type: 'boolean', name: 'pinned', note: 'replyCount, openReports' },
] });

const reaction = entity({ ...OPTS, x: X[2], y: 44, name: 'reactions', tone: 'network', rows: [
  { type: 'ObjectId', name: 'video', key: 'FK', note: '→ videos' },
  { type: 'ObjectId', name: 'user', key: 'FK', note: '→ users; pair unique' },
  { type: 'string', name: 'kind', note: 'like or dislike' },
] });
const tier = entity({ ...OPTS, x: X[2], y: reaction.box.b + 40, name: 'membershipTiers', tone: 'secret', rows: [
  { type: 'ObjectId', name: '_id', key: 'PK' },
  { type: 'ObjectId', name: 'channel', key: 'FK', note: '→ users' },
  { type: 'number', name: 'level', key: 'UK', note: 'unique per channel if active' },
  { type: 'number', name: 'price', note: 'VND, sandbox payment' },
  { type: 'string[]', name: 'perks', note: 'with name, badge colour' },
] });
const member = entity({ ...OPTS, x: X[2], y: tier.box.b + 40, name: 'memberships', tone: 'secret', rows: [
  { type: 'ObjectId', name: 'member', key: 'FK', note: '→ users' },
  { type: 'ObjectId', name: 'channel', key: 'FK', note: '→ users; pair unique' },
  { type: 'ObjectId', name: 'tier', key: 'FK', note: '→ membershipTiers' },
  { type: 'Date', name: 'expiresAt', note: 'thirty days; cancelled flag' },
] });
const daily = entity({ ...OPTS, x: X[2], y: member.box.b + 40, name: 'analyticsDaily', tone: 'storage', rows: [
  { type: 'ObjectId', name: 'video', key: 'FK', note: '→ videos' },
  { type: 'string', name: 'date', note: 'one row per video and day' },
  { type: 'number', name: 'views, watchSeconds' },
  { type: 'number[]', name: 'retention', note: 'twenty buckets' },
] });

p.push(user.svg, sub.svg, playlist.svg, video.svg, comment.svg, reaction.svg, tier.svg, member.svg, daily.svg);
p.push(text('PK primary key  ·  UK unique index  ·  FK reference; the note names the referenced collection',
  40, H - 24, { size: 15, anchor: 'start', fill: PALETTE.muted }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('04-database-erd', svg, 3);
console.log(`04-database-erd -> ${(out.bytes / 1024).toFixed(0)} KB`);
