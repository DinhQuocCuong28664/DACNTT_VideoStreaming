/**
 * Hình 3.1 — Sơ đồ use case.
 *
 * Vẽ lại từ bản Mermaid vì hai lỗi, không phải vì sở thích trình bày.
 *
 * Ký hiệu sai: Mermaid không có kiểu sơ đồ use case, bản cũ là một flowchart
 * giả lập nên use case vẽ bằng hình chữ nhật và tác nhân vẽ bằng hình tròn.
 * UML quy định ellipse cho use case, hình người que cho tác nhân, và đường liên
 * kết KHÔNG có đầu mũi tên; mũi tên chỉ dành cho include và extend.
 *
 * Định tuyến hỏng: sáu đường từ tác nhân "Anonymous visitor" cắt chéo nhau và
 * cắt xuyên qua chính các ô use case.
 *
 * Cách xếp ở đây khử hết đường cắt nhau. Use case chia ba nhóm theo tác nhân,
 * nhóm dùng chung đặt giữa hai tác nhân, nên đường của tác nhân phía trên chỉ
 * đi xuống còn đường của tác nhân phía dưới chỉ đi lên, hai chùm không bao giờ
 * gặp nhau. Mỗi tác nhân dùng một làn dọc riêng để đoạn thân đường không chồng.
 *
 * Hai use case là đích của quan hệ include được đặt lệch sang phải ngay cạnh
 * nguồn của chúng, thay vì thành hai hàng riêng. Thêm hai hàng sẽ kéo hình cao
 * thêm và làm chữ nhỏ đi khi thu vừa trang.
 */
import { usecase, actor, assoc, edge, group, text, document_, write, PALETTE, TYPE } from './render.mjs';

// Canvas rong 1000px, in ra 147,2mm, nen mot px canvas la 0,147mm tren giay.
// Chu nho nhat phai tu 14,9px tro len moi dat 6,2pt; lay 15px cho tron. Nhan
// cang va nhan tac nhan truoc day la 13 va 14px, tuc 5,4 va 5,8pt.
Object.assign(TYPE, {
  edgeLabel: 15,
  actorLabel: 15,
  actorLabelLH: 18,
});

const W = 1000;
const H = 1494;
const p = [];

const UC_X = 478;          // tâm cột use case chính
const RX = 152;
const RY = 37;
const ROW = 86;

const OFF_X = 800;         // tâm cột lệch, dành cho đích của quan hệ include
const OFF_RX = 128;

const LANE_ANON = 196;
const LANE_USER = 224;
const LANE_SYS = 196;

// ── Ranh giới hệ thống ──────────────────────────────────────────────────────
p.push(group({
  x: 300, y: 40, w: 664, h: 1292,
  label: 'Video sharing platform', stroke: '#8a94a6', fill: '#fcfdfe', dash: '7 5',
}).svg);

// ── Use case trong cột chính ────────────────────────────────────────────────
const first = 108;
const at = (i) => first + i * ROW;

const uc = {};
const place = (key, i, label, tone = 'network', dy = 0) => {
  const u = usecase({ cx: UC_X, cy: at(i) + dy, rx: RX, ry: RY, label, tone });
  p.push(u.svg);
  uc[key] = u;
};

// Nhóm 1: chỉ khách vãng lai
place('register', 0, 'Register an account');
place('login', 1, 'Log in');
place('google', 2, 'Sign in with Google');

// Nhóm 2: dùng chung cho cả hai tác nhân người
place('browse', 3, 'Browse public videos');
place('search', 4, ['Search and filter', 'by category']);
place('watch', 5, ['Watch HLS video', 'with ABR']);

// Nhóm 3: chỉ người dùng đã đăng ký
place('reset', 6, ['Reset a forgotten', 'password']);
place('upload', 7, ['Upload a video via', 'a pre-signed URL']);
place('manage', 8, ['Manage videos on', 'their own channel']);
place('react', 9, 'Like or dislike a video');
place('comment', 10, 'Comment on a video');
place('share', 11, 'Share a video link');

// Nhóm 4: do hệ thống chuyển mã tự khởi động
place('transcode', 12, ['Transcode to HLS', 'automatically'], 'compute');
// Cách xa hơn một nhịp so với các hàng khác: hai ellipse liền nhau chỉ hở 12px,
// không đủ chỗ cho một mũi tên include nhìn ra được.
place('thumb', 13, ['Generate a thumbnail', 'and metadata'], 'compute', 38);

// ── Hai đích của quan hệ include, đặt lệch phải ─────────────────────────────
const visibility = usecase({
  cx: OFF_X, cy: at(7), rx: OFF_RX, ry: RY,
  label: ['Set public or', 'private visibility'],
});
const del = usecase({
  cx: OFF_X, cy: at(8) + 46, rx: OFF_RX, ry: RY, label: 'Delete a video',
});
p.push(visibility.svg, del.svg);

// ── Tác nhân ────────────────────────────────────────────────────────────────
const anon = actor({ cx: 108, cy: at(1) - 12, label: ['Anonymous', 'visitor'] });
const user = actor({ cx: 108, cy: at(8) - 12, label: ['Registered', 'user'] });
const sys = actor({ cx: 108, cy: at(13) + 32, label: ['Transcoding', 'system'] });
p.push(anon.svg, user.svg, sys.svg);

/** Liên kết tác nhân với use case qua một làn dọc riêng. */
function link(a, lane, target) {
  p.push(assoc([[a.box.r, a.box.cy], [lane, a.box.cy], [lane, target.box.cy], [target.box.l, target.box.cy]]));
}

['register', 'login', 'google', 'browse', 'search', 'watch']
  .forEach((k) => link(anon, LANE_ANON, uc[k]));
['browse', 'search', 'watch', 'reset', 'upload', 'manage', 'react', 'comment', 'share']
  .forEach((k) => link(user, LANE_USER, uc[k]));
['transcode', 'thumb'].forEach((k) => link(sys, LANE_SYS, uc[k]));

// ── Quan hệ include và trigger ──────────────────────────────────────────────
p.push(edge([[uc.upload.box.r, uc.upload.box.cy], [visibility.box.l, visibility.box.cy]],
  { dashed: true, label: '«include»', labelDy: -8 }));
p.push(edge([[uc.manage.box.r - 30, uc.manage.box.b - 8], [del.box.l, del.box.cy]],
  { dashed: true, label: '«include»', labelDy: -8 }));

// Tải lên kích hoạt chuyển mã. Đi vòng ngoài lề phải để không cắt qua use case
// nào trong cột chính.
const TRIG_X = UC_X + RX + 22;   // khe hep giua hai cot, khong cat qua gi
p.push(edge([
  [uc.upload.box.r, uc.upload.box.cy + 22], [TRIG_X, uc.upload.box.cy + 22],
  [TRIG_X, uc.transcode.box.cy], [uc.transcode.box.r, uc.transcode.box.cy],
], {
  dashed: true, label: '«trigger»', labelDy: -8, labelAt: 0.62,
  // Đẩy hẳn sang phải đường: nhãn rộng 89px mà khe giữa hai cột ellipse chỉ hở
  // 42px, nên căn giữa thì nền trắng của nhãn liếm vào mép ellipse cột chính.
  // Bên phải đường ở đúng độ cao này đang trống, đặt lệch sang đó là sạch.
  labelDx: 50,
}));

p.push(edge([[uc.transcode.box.cx, uc.transcode.box.b], [uc.thumb.box.cx, uc.thumb.box.t]],
  { dashed: true, label: '«include»', labelDx: 62, labelDy: 5 }));

p.push(text(
  ['Association lines carry no arrowhead, as UML specifies. Only «include» and',
   '«trigger» relationships are directed. The transcoding use cases attach to the',
   'system actor because events start them, not a human action.'],
  40, H - 74, { size: 15, anchor: 'start', fill: PALETTE.muted, lineHeight: 19 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('05-use-case', svg, 3);
console.log(`05-use-case -> ${(out.bytes / 1024).toFixed(0)} KB`);
