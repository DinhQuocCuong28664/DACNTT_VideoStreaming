/**
 * Hình 2.2 — Các tệp HLS sinh ra từ một video nguồn và thứ tự người xem tải.
 *
 * Vẽ lại bản Mermaid vì hai lỗi nội dung do chính bản cũ mang, không phải vì
 * trình bày.
 *
 * Sai số liệu: bản cũ ghi 800 / 2800 / 5000 kbps. Không con số nào trong đó là
 * bitrate thật. Cấu hình ở transcoder/src/config.js đặt 400k, 1500k và 4000k
 * cho video; 800k là `bufsize` của rung 360p còn 5000k là `maxrate` của rung
 * 1080p, hai đại lượng khác hẳn. Phụ lục A vẫn in đúng lệnh FFmpeg, nên bản cũ
 * còn tự mâu thuẫn với phụ lục của chính báo cáo.
 *
 * Sai cơ chế: bản cũ ghi "one encoding pass per rung", trong khi mục 5.2 và
 * phụ lục A đều nói FFmpeg chạy một lần duy nhất với `split=3`, giải mã nguồn
 * đúng một lần rồi mã hoá song song ba rung. Đó chính là lý do chọn cách làm
 * này, nên vẽ sai là làm mất lập luận.
 *
 * Bố cục dọc và hẹp để đặt vừa bề rộng vùng chữ mà nhãn vẫn khoảng 8,7pt, mức
 * lớn nhất trong các hình của báo cáo.
 */
import { card, edge, text, document_, write, PALETTE } from './render.mjs';

const W = 792;
const H = 906;
const p = [];

const CX = W / 2;

// ── Nguồn và bộ mã hoá ──────────────────────────────────────────────────────
const src = card({
  x: CX - 180, y: 34, w: 360, h: 92,
  title: 'Uploaded source file', sub: ['any container, codec and resolution'],
  tone: 'storage',
});
// Không đặt `title`: logo FFmpeg vốn đã là chữ "FFmpeg", nên thêm dòng tiêu đề
// là in cùng một từ hai lần và bắt cả hai phải nhỏ lại để chia chỗ cho nhau. Bỏ
// dòng chữ đi thì logo đứng một mình được.
//
// Cỡ logo chọn theo chiều cao chữ hoa chứ không theo bề rộng ô: chữ trong logo
// FFmpeg cao bằng 79/138 chiều cao ảnh, nên ở 110px thì chữ hoa cao 17px, tức
// gấp 1,5 lần chữ hoa của dòng tiêu đề 16px ở các thẻ bên cạnh. Đủ để thấy đây
// là một logo mà không lấn át những thẻ còn lại.
const ff = card({
  x: CX - 180, y: 176, w: 360, h: 98, iconName: 'ffmpeg', iconSize: 110,
  sub: ['a single invocation, source decoded once'],
  tone: 'compute',
});
p.push(src.svg, ff.svg);
p.push(edge([[src.box.cx, src.box.b], [ff.box.cx, ff.box.y]]));

// ── Ba rung của thang bitrate ───────────────────────────────────────────────
const RW = 236;
const RGAP = 14;
const rowX = CX - (RW * 3 + RGAP * 2) / 2;
const RY = 372;

const rungs = [
  { name: '360p', v: '400 kbps', a: '64 kbps', dir: '360p/index.m3u8' },
  { name: '720p', v: '1500 kbps', a: '128 kbps', dir: '720p/index.m3u8' },
  { name: '1080p', v: '4000 kbps', a: '192 kbps', dir: '1080p/index.m3u8' },
];

const boxes = rungs.map((r, i) => {
  const c = card({
    x: rowX + i * (RW + RGAP), y: RY, w: RW, h: 124,
    title: r.name,
    sub: [`video ${r.v}, audio ${r.a}`, r.dir, 'plus 6-second .ts segments'],
    tone: 'network',
  });
  p.push(c.svg);
  return c;
});

// Một lệnh, ba đầu ra: nhánh toả ra từ cùng một điểm để thấy rõ là song song
// trong cùng một lần chạy, không phải ba lần chạy nối tiếp.
const FAN_Y = 330;
p.push(edge([[ff.box.cx, ff.box.b], [ff.box.cx, FAN_Y]], { arrow: false }));
boxes.forEach((b) => {
  p.push(edge([[ff.box.cx, FAN_Y], [b.box.cx, FAN_Y], [b.box.cx, b.box.y]]));
});
p.push(text('split=3, encoded in parallel', ff.box.cx + 122, FAN_Y - 10,
  { size: 13, anchor: 'start', fill: PALETTE.muted }));

// ── Master playlist và trình phát ───────────────────────────────────────────
const master = card({
  x: CX - 200, y: 588, w: 400, h: 96,
  title: 'master.m3u8',
  sub: ['lists each rendition with its declared bandwidth'],
  tone: 'compute',
});
p.push(master.svg);
boxes.forEach((b) => {
  p.push(edge([[b.box.cx, b.box.b], [b.box.cx, 560], [master.box.cx, 560], [master.box.cx, master.box.y]],
    { arrow: b === boxes[1] }));
});

const player = card({
  x: CX - 210, y: 746, w: 420, h: 118, iconName: 'javascript', iconSize: 28,
  title: 'Player (hls.js)',
  sub: ['measures throughput and switches rung', 'at a segment boundary'],
  tone: 'secret',
});
p.push(player.svg);
p.push(edge([[master.box.cx, master.box.b], [player.box.cx, player.box.y]],
  { label: 'fetch master, then one rendition playlist and its segments', labelDy: -9 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('06-hls-abr', svg, 3);
console.log(`06-hls-abr -> ${(out.bytes / 1024).toFixed(0)} KB`);
