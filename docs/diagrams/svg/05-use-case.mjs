/**
 * Hình 3.1 — Sơ đồ use case của người xem (khách và người dùng đã đăng ký).
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
  edgeLabel: 16,
  actorLabel: 16,
  actorLabelLH: 19,
  usecaseLabel: 16,
  usecaseLabelLH: 19,
  groupLabel: 16,
});

const W = 1060;   // 1000 trước khi nới khe include thêm 60px; vẫn 6,7pt khi in
const H = 1440;
const p = [];

const UC_X = 478;          // tâm cột use case chính
const RX = 152;
const RY = 34;
const ROW = 80;   // 15 use case trong cột chính; giữ hàng 86 thì hình cao hơn trang cho phép

const OFF_X = 880;         // tâm cột lệch, dành cho đích của quan hệ include; khe tới cột chính
                           // rộng 122px, đủ cho nhãn «include» (84px) mà không cắt ellipse nào
const OFF_RX = 128;

const LANE_ANON = 196;
const LANE_USER = 224;
const LANE_SYS = 196;

// ── Ranh giới hệ thống ──────────────────────────────────────────────────────
p.push(group({
  x: 300, y: 40, w: 724, h: 1250,
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
place('login', 1, ['Sign in with a password', 'or with Google']);

// Nhóm 2: dùng chung cho cả hai tác nhân người
place('home', 2, 'Browse the home feed');
place('search', 3, ['Search videos and', 'channels']);
place('watch', 4, ['Watch a video', 'with adaptive bitrate']);
place('unlock', 5, ['Unlock a password-', 'protected video']);
place('channel', 6, 'Open a channel page');
place('share', 7, ['Share a link or', 'embed the player']);

// Nhóm 3: chỉ người dùng đã đăng ký
place('verify', 8, 'Verify the e-mail address');
place('reset', 9, ['Reset or change', 'the password']);
place('interact', 10, ['Like, comment', 'and reply']);
place('subscribe', 11, 'Subscribe to a channel');
place('member', 12, ['Join a channel', 'membership tier']);
place('library', 13, ['Keep history, watch', 'later and playlists']);
place('notify', 14, 'Read notifications');

// ── Đích của quan hệ include, đặt lệch phải ─────────────────────────────────
const count = usecase({
  cx: OFF_X, cy: at(4), rx: OFF_RX, ry: RY,
  label: ['Resume and count', 'a view after 30 s'],
});
p.push(count.svg);

// ── Tác nhân ────────────────────────────────────────────────────────────────
const anon = actor({ cx: 108, cy: at(3) - 12, label: ['Anonymous', 'visitor'] });
const user = actor({ cx: 108, cy: at(10) - 12, label: ['Registered', 'user'] });
p.push(anon.svg, user.svg);

/** Liên kết tác nhân với use case qua một làn dọc riêng. */
function link(a, lane, target) {
  p.push(assoc([[a.box.r, a.box.cy], [lane, a.box.cy], [lane, target.box.cy], [target.box.l, target.box.cy]]));
}

['register', 'login', 'home', 'search', 'watch', 'unlock', 'channel', 'share']
  .forEach((k) => link(anon, LANE_ANON, uc[k]));
['home', 'search', 'watch', 'unlock', 'channel', 'share', 'verify', 'reset', 'interact', 'subscribe', 'member', 'library', 'notify']
  .forEach((k) => link(user, LANE_USER, uc[k]));

// ── Quan hệ include ─────────────────────────────────────────────────────────
p.push(edge([[uc.watch.box.r, uc.watch.box.cy], [count.box.l, count.box.cy]],
  { dashed: true, label: '«include»', labelDy: -8 }));

p.push(text(
  ['Association lines carry no arrowhead, as UML specifies; only «include» is directed.',
   'A signed-in user can do everything a visitor can. Uploading and the creator studio',
   'are in Figure 3.2, moderation in Figure 3.3.'],
  40, H - 78, { size: 16, anchor: 'start', fill: PALETTE.muted, lineHeight: 20 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('05-use-case', svg, 3);
console.log(`05-use-case -> ${(out.bytes / 1024).toFixed(0)} KB`);
