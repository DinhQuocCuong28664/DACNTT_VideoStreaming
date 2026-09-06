/**
 * Hình 4.3 — Sơ đồ quan hệ thực thể của mô hình dữ liệu MongoDB.
 *
 * Vẽ lại từ `erDiagram` của Mermaid vì bố cục chứ không vì nội dung: Mermaid
 * xếp ba bảng cạnh nhau và lấy chiều cao theo bảng cao nhất, mà VIDEO có hai
 * mươi dòng còn USER chỉ mười bốn và COMMENT sáu, nên gần bốn mươi phần trăm
 * khung hình là khoảng trắng. Khung to hơn nội dung cần thì khi thu vừa trang
 * chữ nhỏ theo, và bản cũ in ra chỉ còn khoảng 4,5pt.
 *
 * Ở đây USER xếp trên COMMENT thành một cột, đối diện VIDEO. Mười bốn cộng sáu
 * dòng gần bằng hai mươi dòng, nên hai cột cao xấp xỉ nhau và gần như không còn
 * khoảng chết.
 *
 * Nội dung giữ nguyên từ bản cũ, kể cả các ghi chú giải thích cột.
 */
import { entity, edge, text, document_, write, PALETTE, TYPE } from './render.mjs';

// Canvas rộng 1300px, xoay ngang nên in ra 247mm, tức 1px là 0,19mm. Chữ nhỏ
// nhất là nhãn khoá PK/UK ở cỡ mặc định 12px, chỉ in ra 6,46pt. Bề rộng đã kịch
// trần nên cần gạt còn lại là font. Nâng lên 13,5px thì cột ghi chú tràn ra
// ngoài viền, vì cột đó bắt đầu ở x+326 nên chỗ còn lại chỉ bằng bề rộng thực
// thể trừ 326. Nới USER 470 lên 490 và VIDEO 570 lên 600 là vừa, và nới được
// vì canvas còn lề chưa dùng. Riêng dòng liệt kê bốn trạng thái là chữ hoa,
// mà chữ hoa rộng hơn chữ thường chừng một phần tư, nên nó cần tới 325px và
// canvas phải nới từ 1300 lên 1345. Nới canvas thì cỡ chữ in ra tụt nhẹ từ
// 7,27 xuống 7,05pt, vẫn trên mức nhắm.
Object.assign(TYPE, {
  entityKey: 13.5,
  entityRow: 13.5,
  edgeLabel: 13.5,
});

const W = 1345;
const H = 764;
const p = [];

const LEFT = 40;
const RIGHT = 670;
const COL_W = 490;

// ── USER ────────────────────────────────────────────────────────────────────
const user = entity({
  x: LEFT, y: 44, w: COL_W, name: 'USER', tone: 'storage',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'string', name: 'username', key: 'UK' },
    { type: 'string', name: 'email', key: 'UK' },
    { type: 'string', name: 'password', note: 'bcrypt, select false' },
    { type: 'string', name: 'googleId', note: 'sub claim, sparse' },
    { type: 'string', name: 'displayName' },
    { type: 'string', name: 'avatar' },
    { type: 'string', name: 'channelDescription' },
    { type: 'number', name: 'subscribers' },
    { type: 'string', name: 'resetPasswordToken', note: 'SHA-256' },
    { type: 'Date', name: 'resetPasswordExpire' },
    { type: 'Date', name: 'passwordChangedAt', note: 'invalidates old JWTs' },
    { type: 'Date', name: 'createdAt' },
    { type: 'Date', name: 'updatedAt' },
  ],
});
p.push(user.svg);

// ── COMMENT ─────────────────────────────────────────────────────────────────
const comment = entity({
  x: LEFT, y: user.box.b + 54, w: COL_W, name: 'COMMENT', tone: 'network',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'ObjectId', name: 'video', key: 'FK' },
    { type: 'ObjectId', name: 'user', key: 'FK' },
    { type: 'string', name: 'content' },
    { type: 'Date', name: 'createdAt' },
    { type: 'Date', name: 'updatedAt' },
  ],
});
p.push(comment.svg);

// ── VIDEO ───────────────────────────────────────────────────────────────────
const video = entity({
  x: RIGHT, y: 44, w: 655, name: 'VIDEO', tone: 'compute',
  rows: [
    { type: 'ObjectId', name: '_id', key: 'PK' },
    { type: 'ObjectId', name: 'user', key: 'FK' },
    { type: 'string', name: 'title' },
    { type: 'string', name: 'description' },
    { type: 'string', name: 'category', note: 'enum of 7 categories' },
    { type: 'string', name: 'status', note: 'UPLOADING, PROCESSING, READY, ERROR' },
    { type: 'string', name: 'visibility', note: 'public / private / unlisted' },
    { type: 'string', name: 'rawS3Key' },
    { type: 'string', name: 'hlsUrl', note: 'CloudFront master m3u8' },
    { type: 'string', name: 'thumbnailUrl' },
    { type: 'number', name: 'duration', note: 'seconds' },
    { type: 'number', name: 'fileSize', note: 'bytes' },
    { type: 'string', name: 'mimeType' },
    { type: 'number', name: 'views' },
    { type: 'ObjectId[]', name: 'likes', key: 'FK' },
    { type: 'ObjectId[]', name: 'dislikes', key: 'FK' },
    { type: 'string[]', name: 'tags' },
    { type: 'Date', name: 'createdAt' },
    { type: 'Date', name: 'updatedAt' },
  ],
});
p.push(video.svg);

// ── Quan hệ ─────────────────────────────────────────────────────────────────
// Ba quan hệ đều là một-nhiều, ký hiệu bằng chữ chứ không bằng chân quạ, vì ở
// cỡ chữ này chân quạ nhỏ tới mức không phân biệt được khi in.
const LANE = RIGHT - 84;

p.push(edge([[user.box.r, user.rowY(0)], [LANE, user.rowY(0)], [LANE, video.rowY(1)], [video.box.x, video.rowY(1)]],
  { label: 'uploads  1 : N', labelDy: -8, labelAt: 0.5 }));

p.push(edge([[user.box.r, user.rowY(2)], [LANE - 34, user.rowY(2)], [LANE - 34, comment.rowY(2)], [comment.box.r, comment.rowY(2)]],
  { label: 'writes  1 : N', labelDy: -8, labelAt: 0.55 }));

p.push(edge([[video.box.x, video.rowY(17)], [LANE, video.rowY(17)], [LANE, comment.rowY(1)], [comment.box.r, comment.rowY(1)]],
  { label: 'has  1 : N', labelDy: -8, labelAt: 0.5 }));

p.push(text(
  ['PK primary key  ·  UK unique key  ·  FK foreign key  ·  [] array of references'],
  LEFT, H - 22, { size: 13.5, anchor: 'start', fill: PALETTE.muted }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('04-database-erd', svg, 3);
console.log(`04-database-erd -> ${(out.bytes / 1024).toFixed(0)} KB`);
