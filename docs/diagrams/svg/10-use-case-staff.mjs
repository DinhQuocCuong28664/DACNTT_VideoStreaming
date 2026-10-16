/**
 * Hình 3.2 — Sơ đồ use case của kiểm duyệt và vận hành.
 *
 * Hình 3.1 chỉ có người dùng nền tảng và hệ thống chuyển mã. Các yêu cầu FR-12 đến FR-17 có thêm ba
 * tác nhân nhân sự (operator, auditor, administrator) nhưng nhét vào hình 3.1 thì hình cao hơn trang
 * và chữ nhỏ lại, nên tách thành hình riêng. Hai hình dùng chung quy ước: ellipse cho use case, người
 * que cho tác nhân, đường liên kết không có đầu mũi tên, mũi tên nét đứt «trigger» cho quan hệ
 * "việc này làm xuất hiện việc kia".
 *
 * Bố cục hai cột trong ranh giới hệ thống. Cột trái là những việc do người dùng thường hoặc hệ thống
 * khởi động (sàng lọc tự động, báo cáo video, khiếu nại), cột phải là việc của nhân sự. Tác nhân của
 * cột trái đứng bên trái, tác nhân nhân sự đứng bên phải, nên không có đường liên kết nào chạy qua
 * cột còn lại. Các use case của một tác nhân nhân sự xếp liền nhau để đường dọc của tác nhân đó
 * không cắt đường của tác nhân khác.
 *
 * Quan hệ "administrator làm được mọi việc của operator và auditor" KHÔNG vẽ thành mũi tên khái
 * quát hoá: nó phải vắt qua hình người que của auditor, và ghi bằng một dòng chú thích thì đọc nhanh
 * hơn. Mỗi liên kết chỉ vẽ một lần, ở vai trò sở hữu use case đó (xem bảng quyền ở mục 4.5.5).
 */
import { usecase, actor, assoc, edge, group, text, document_, write, PALETTE, TYPE } from './render.mjs';

// Canvas rộng 1180px, in ra khoảng 147mm: một px là 0,125mm trên giấy. Chữ nhỏ nhất phải từ 17,5px
// trở lên mới đạt 6,2pt; lấy 18px.
Object.assign(TYPE, {
  edgeLabel: 18,
  actorLabel: 18,
  actorLabelLH: 21,
  usecaseLabel: 18,
  usecaseLabelLH: 21,
  groupLabel: 18,
});

const W = 1180;
const H = 1010;
const p = [];

const LX = 330;            // tâm cột trái
const LRX = 125;
const RX_ = 800;           // tâm cột phải
const RRX = 140;
const RY = 36;

const BOUND_X = 170;
const BOUND_W = 800;
const LANE_L = 150;        // làn dọc của tác nhân bên trái, ngoài ranh giới
const LANE_R = 990;        // làn dọc của tác nhân bên phải, ngoài ranh giới

p.push(group({
  x: BOUND_X, y: 40, w: BOUND_W, h: 860,
  label: 'Moderation and operation', stroke: '#8a94a6', fill: '#fcfdfe', dash: '7 5',
}).svg);

// ── Cột phải: việc của nhân sự, mỗi tác nhân một khối liền nhau ─────────────────
const R0 = 190;
const PITCH = 92;
const ry = (i) => R0 + i * PITCH;

const right = {};
const placeR = (key, i, label) => {
  right[key] = usecase({ cx: RX_, cy: ry(i), rx: RRX, ry: RY, label });
  p.push(right[key].svg);
};

// Operator
placeR('decide', 0, ['Approve or remove a video,', 'with a reason']);
placeR('confirm', 1, ['Confirm a removal', 'the machine made']);
placeR('appeal', 2, ['Resolve an appeal', 'with a note']);
placeR('label', 3, ['Label a video of', 'an audit sample']);
// Auditor
placeR('rates', 4, ['Read the error rates', 'with their intervals']);
placeR('log', 5, 'Read the decision log');
// Administrator
placeR('sample', 6, ['Draw a random', 'audit sample']);
placeR('roles', 7, ['Assign or change', "a user's role"]);

// ── Cột trái: việc do người dùng hoặc hệ thống khởi động ────────────────────────
const left = {};
const placeL = (key, cy, label, tone = 'network') => {
  left[key] = usecase({ cx: LX, cy, rx: LRX, ry: RY, label, tone });
  p.push(left[key].svg);
};
placeL('screen', 108, ['Screen frames of', 'an uploaded video'], 'compute');
placeL('report', ry(0), 'Report a video');
placeL('appealOwn', ry(2), ['Appeal the removal of', "one's own video"]);

// ── Tác nhân ────────────────────────────────────────────────────────────────────
const sys = actor({ cx: 78, cy: 108, label: ['Transcoding', 'system'] });
const user = actor({ cx: 78, cy: Math.round((ry(0) + ry(2)) / 2) + 18, label: ['Registered', 'user'] });
const operator = actor({ cx: 1090, cy: Math.round((ry(0) + ry(3)) / 2), label: 'Operator' });
const auditor = actor({ cx: 1090, cy: Math.round((ry(4) + ry(5)) / 2), label: 'Auditor' });
const admin = actor({ cx: 1090, cy: Math.round((ry(6) + ry(7)) / 2), label: ['Administrator'] });
p.push(sys.svg, user.svg, operator.svg, auditor.svg, admin.svg);

/** Liên kết tác nhân bên trái với use case ở cột trái, qua làn dọc riêng. */
function linkLeft(a, target, fromY = a.box.cy) {
  p.push(assoc([[a.box.r, fromY], [LANE_L, fromY], [LANE_L, target.box.cy], [target.box.l, target.box.cy]]));
}
/** Liên kết tác nhân bên phải với use case ở cột phải. */
function linkRight(a, target) {
  p.push(assoc([[a.box.l, a.box.cy], [LANE_R, a.box.cy], [LANE_R, target.box.cy], [target.box.r, target.box.cy]]));
}

linkLeft(sys, left.screen);
linkLeft(user, left.report);
linkLeft(user, left.appealOwn);
['decide', 'confirm', 'appeal', 'label'].forEach((k) => linkRight(operator, right[k]));
['rates', 'log'].forEach((k) => linkRight(auditor, right[k]));
['sample', 'roles'].forEach((k) => linkRight(admin, right[k]));

// ── Quan hệ «trigger» ───────────────────────────────────────────────────────────
const JOIN_X = right.decide.box.l - 40;   // nơi nhánh sàng lọc đi xuống hợp với nhánh báo cáo, sát cột phải
p.push(edge([[left.report.box.r, left.report.box.cy], [right.decide.box.l, right.decide.box.cy]],
  { dashed: true, label: '«trigger»', labelAt: 0.3, labelDy: -8 }));
p.push(edge([
  [left.screen.box.r, left.screen.box.cy], [JOIN_X, left.screen.box.cy],
  [JOIN_X, right.decide.box.cy], [right.decide.box.l, right.decide.box.cy],
], { dashed: true, label: '«trigger»', labelAt: 0.35, labelDy: -8 }));
p.push(edge([[left.appealOwn.box.r, left.appealOwn.box.cy], [right.appeal.box.l, right.appeal.box.cy]],
  { dashed: true, label: '«trigger»', labelAt: 0.5, labelDy: -8 }));

p.push(text(
  ['Reporting and appealing are open to every signed-in user. An administrator can also do everything',
   'an operator or an auditor can, so each association is drawn once, at the role that owns the use case.',
   'Screening acts on its own; what it holds back, and what viewers report, reaches an operator for a decision.'],
  40, H - 78, { size: 18, anchor: 'start', fill: PALETTE.muted, lineHeight: 23 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('10-use-case-staff', svg, 3);
console.log(`10-use-case-staff -> ${(out.bytes / 1024).toFixed(0)} KB`);
