/**
 * Hình 3.2 — Sơ đồ use case của người tạo nội dung và hệ thống xử lý.
 *
 * Tách khỏi Hình 3.1 vì gộp lại thì hình cao hơn một trang và chữ nhỏ dưới mức in được.
 * Cùng quy ước với Hình 3.1 và 3.3: ellipse cho use case, người que cho tác nhân, đường liên kết
 * không có đầu mũi tên, «include» và «trigger» là mũi tên nét đứt.
 *
 * Hai tác nhân đứng bên trái, mỗi tác nhân một khối hàng liền nhau, nên hai chùm đường không gặp
 * nhau. Đích của «include» đặt ở cột lệch phải, cùng hàng với nguồn. Đường «trigger» từ upload
 * xuống chuyển mã chạy trong khe giữa hai cột để không cắt ellipse nào.
 */
import { usecase, actor, assoc, edge, group, text, document_, write, PALETTE, TYPE } from './render.mjs';

Object.assign(TYPE, {
  edgeLabel: 16,
  actorLabel: 16,
  actorLabelLH: 19,
  usecaseLabel: 16,
  usecaseLabelLH: 19,
  groupLabel: 16,
});

const W = 1060;
const H = 1150;
const p = [];

const UC_X = 478;
const RX = 152;
const RY = 34;
const ROW = 80;
const OFF_X = 880;
const OFF_RX = 128;
const LANE_CREATOR = 210;
const LANE_SYS = 210;

p.push(group({
  x: 300, y: 40, w: 724, h: 960,
  label: 'Video sharing platform', stroke: '#8a94a6', fill: '#fcfdfe', dash: '7 5',
}).svg);

const first = 108;
const at = (i) => first + i * ROW;
const uc = {};
const place = (key, i, label, tone = 'network', dy = 0) => {
  const u = usecase({ cx: UC_X, cy: at(i) + dy, rx: RX, ry: RY, label, tone });
  p.push(u.svg);
  uc[key] = u;
};

// Người tạo nội dung
place('upload', 0, ['Upload a video directly', 'to storage']);
place('edit', 1, ['Edit details and', 'the thumbnail']);
place('captions', 2, ['Add captions', 'and chapters']);
place('schedule', 3, ['Schedule the', 'publication']);
place('analytics', 4, ['Read channel and', 'video analytics']);
place('profile', 5, ['Customise the', 'channel profile']);
place('tiers', 6, ['Manage membership', 'tiers']);
place('delete', 7, 'Delete a video');

// Hệ thống xử lý, khởi động bằng sự kiện
place('transcode', 8, ['Transcode to', 'encrypted HLS'], 'compute', 24);
place('publish', 9, ['Publish at the', 'scheduled time'], 'compute', 24);
place('notify', 10, ['Notify subscribers', 'of a new video'], 'compute', 24);

// Đích của «include», cột lệch phải
const vis = usecase({ cx: OFF_X, cy: at(0), rx: OFF_RX, ry: RY, label: ['Set visibility', 'and audience'] });
const screen = usecase({ cx: OFF_X, cy: at(8) + 24, rx: OFF_RX, ry: RY, label: ['Screen frames and', 'make previews'], tone: 'compute' });
p.push(vis.svg, screen.svg);

const creator = actor({ cx: 108, cy: at(3) + 28, label: ['Creator', '(registered user)'] });
const sys = actor({ cx: 108, cy: at(9) + 12, label: ['Processing', 'system'] });
p.push(creator.svg, sys.svg);

function link(a, lane, target) {
  p.push(assoc([[a.box.r, a.box.cy], [lane, a.box.cy], [lane, target.box.cy], [target.box.l, target.box.cy]]));
}
['upload', 'edit', 'captions', 'schedule', 'analytics', 'profile', 'tiers', 'delete']
  .forEach((k) => link(creator, LANE_CREATOR, uc[k]));
['transcode', 'publish', 'notify'].forEach((k) => link(sys, LANE_SYS, uc[k]));

p.push(edge([[uc.upload.box.r, uc.upload.box.cy], [vis.box.l, vis.box.cy]],
  { dashed: true, label: '«include»', labelDy: -8 }));
p.push(edge([[uc.transcode.box.r, uc.transcode.box.cy], [screen.box.l, screen.box.cy]],
  { dashed: true, label: '«include»', labelDy: -8 }));

// Upload xong thì S3 phát sự kiện và việc chuyển mã bắt đầu.
const TRIG_X = UC_X + RX + 22;
p.push(edge([
  [uc.upload.box.r, uc.upload.box.cy + 22], [TRIG_X, uc.upload.box.cy + 22],
  [TRIG_X, uc.transcode.box.cy - 20], [uc.transcode.box.r - 14, uc.transcode.box.cy - 20],
], { dashed: true, label: '«trigger»', labelAt: 0.5, labelDx: 50 }));

p.push(text(
  ['The processing use cases attach to a system actor because events start them:',
   'the upload reaching storage, the scheduled time, or a video being published.',
   'The creator is the same registered user as in Figure 3.1.'],
  40, H - 78, { size: 16, anchor: 'start', fill: PALETTE.muted, lineHeight: 20 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('20-use-case-creator', svg, 3);
console.log(`20-use-case-creator -> ${(out.bytes / 1024).toFixed(0)} KB`);
