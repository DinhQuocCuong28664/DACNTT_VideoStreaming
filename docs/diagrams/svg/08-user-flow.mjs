/**
 * Hình 4.4 — Luồng người dùng, từ lúc khách vào trang tới khi video được công bố.
 *
 * Vẽ lại bản Mermaid vì TỈ LỆ KHUNG, không phải vì màu sắc. Bản cũ là 2163×4659
 * px, tức dải dọc 1:2,15, vì `graph TB` của Mermaid xếp mọi thứ thành một cột và
 * không có cách nào bảo nó gấp lại. Hình cao như vậy phải đặt theo chiều cao
 * trang, khi ấy nó chỉ rộng 124mm trên cột chữ 160mm và chữ rơi xuống ~6,8pt.
 *
 * Cách chữa không phải tô đẹp hơn mà là ba cần gạt nêu trong PROMPT.md: bớt hộp
 * trên hàng rộng nhất, rút nhãn, và quan trọng nhất ở đây là gấp luồng thành
 * nhiều cột để hình thấp xuống.
 *
 *   canvas 720px, chữ 14,5px, in ở bề rộng 160mm
 *   → 14,5 / 720 × 160 / 25,4 × 72 = 9,1pt
 *
 * Giữ canvas HẸP là điều phản trực giác nhưng bắt buộc: cỡ chữ in ra tỉ lệ
 * nghịch với bề rộng canvas, nên canvas rộng 1100px sẽ kéo cùng con số 14,5px
 * xuống còn 6,0pt. Vì vậy hình xếp ba cột 200px chứ không trải ngang.
 *
 * BỐ CỤC — ba cột mang ba vai trò khác nhau, không phải chia cho đều:
 *
 *   cột trái   làn công khai: vào trang, xem. Để trống hẳn quãng giữa để cạnh
 *              HOME → WATCH chạy dọc suốt mà không cắt qua hộp nào.
 *   cột giữa   trục chính: hỏi đăng nhập, đăng nhập, tải lên, chờ xử lý.
 *   cột phải   các nhánh rẽ: quên mật khẩu, lỗi chuyển mã, quản lý kênh.
 *
 * Toạ độ đặt tay. Đồ thị chỉ có 13 hộp nhưng có 5 cạnh đi ngược chiều dòng
 * chảy chính (RESET → LOGIN, PROC → CHANNEL, HOME → WATCH, READY → WATCH,
 * CHANNEL → WATCH); bố cục tự động sẽ cho chúng cắt qua hộp, còn đặt tay thì
 * đẩy được ra hai rãnh dọc x=240 và x=704 nằm ngoài mọi cột.
 */
import { chip, edge, text, document_, write, PALETTE, TYPE } from './render.mjs';

// Canvas hẹp nên nâng cỡ chữ lên được mà vẫn vừa hộp; xem phép tính ở đầu tệp.
TYPE.chipLabel = 14.5;
TYPE.chipLabelLH = 17;
TYPE.edgeLabel = 13.5;

const W = 720;
const H = 1060;
const p = [];

// ── Lưới ────────────────────────────────────────────────────────────────────
const CW = 200;
const C1 = 28;                       // làn công khai
const C2 = 260;                      // trục chính
const C3 = 492;                      // nhánh rẽ
const GUTTER_L = 240;                // rãnh dọc giữa cột 1 và cột 2
const GUTTER_R = 704;                // rãnh dọc sát mép phải

const cx1 = C1 + CW / 2;
const cx2 = C2 + CW / 2;
const cx3 = C3 + CW / 2;

const node = (x, y, label, tone, h = 58) =>
  chip({ x, y, w: CW, h, label, tone });

/**
 * Hộp quyết định theo ký hiệu lưu đồ: hình thoi, không phải chữ nhật.
 *
 * `render.mjs` không có sẵn vì sáu hình kia không có bước rẽ nhánh nào. Viết
 * tại chỗ thay vì thêm vào thư viện dùng chung, để không đụng tới bảy hình còn
 * lại chỉ vì một hình cần.
 */
function decision(cx, cy, label, halfW = 100, halfH = 42) {
  const c = PALETTE.secret;
  const pts = `${cx},${cy - halfH} ${cx + halfW},${cy} ${cx},${cy + halfH} ${cx - halfW},${cy}`;
  const svg =
    `<polygon points="${pts}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/>` +
    text(label, cx, cy + 5, { size: TYPE.chipLabel, weight: 'bold' });
  return {
    svg,
    box: { cx, cy, l: cx - halfW, r: cx + halfW, t: cy - halfH, b: cy + halfH },
  };
}

/** Chú giải bốn nhóm màu. Thiếu dòng này thì màu chỉ còn là trang trí. */
function colorLegend(x, y, entries) {
  const parts = [];
  let cur = x;
  for (const e of entries) {
    const c = PALETTE[e.tone];
    parts.push(`<rect x="${cur}" y="${y - 11}" width="18" height="15" rx="3" ` +
      `fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4"/>`);
    parts.push(text(e.label, cur + 25, y + 1,
      { size: TYPE.legendLabel, anchor: 'start', fill: PALETTE.muted }));
    cur += 25 + e.label.length * 6.9 + 26;
  }
  return parts.join('');
}

// ── Hộp ─────────────────────────────────────────────────────────────────────
// Tông màu giữ đúng `classDef` của bản Mermaid cũ, nên hình mới vẫn cùng ngôn
// ngữ thị giác với bảy hình còn lại: storage = công khai, compute = tài khoản,
// network = chủ video, secret = rẽ nhánh và lỗi.
const START = node(C1, 36, 'Visitor opens the site', 'plain', 46);
const HOME = node(C1, 116, ['Catalogue page', 'browse, filter, search'], 'storage');
// Ba dòng để giữ nguyên chữ "adaptive": tính thích ứng của luồng phát chính là
// điều hệ thống này làm, rút gọn thành "playback" là làm mất nội dung.
const WATCH = node(C1, 906, ['Watch page', 'adaptive playback,', 'like, comment, share'], 'storage', 76);

const AUTH = decision(cx2, 248, 'Signed in?');
const LOGIN = node(C2, 320, ['Sign in', 'e-mail, or Google'], 'compute');
const REG = node(C2, 424, 'Register an account', 'compute', 46);
const UPLOAD = node(C2, 520, ['Upload page', 'title, description,', 'category, visibility'], 'network', 76);
const PRESIGN = node(C2, 626, ['Browser transfers the file', 'directly to Amazon S3'], 'network');
// "Video shown as PROCESSING" tràn ra ngoài hộp 200px: chữ hoa rộng hơn ước
// lượng theo số ký tự, và `chip` căn giữa chứ không xuống dòng nên nó lặng lẽ
// thò ra hai bên. "is" thay cho "shown as" giữ nguyên nghĩa mà vừa khung.
const PROC = node(C2, 714, ['Video is PROCESSING', "on the owner's channel"], 'network');
const READY = node(C2, 810, ['Video reaches READY', 'and joins the catalogue'], 'network');

const RESET = node(C3, 424, ['Reset a forgotten password', 'via e-mailed token'], 'compute');
const FAILED = node(C3, 810, ['Video reaches ERROR', 'the watch page says so'], 'secret');
const CHANNEL = node(C3, 906, ['Channel management', 'change visibility, delete'], 'network');

[START, HOME, WATCH, AUTH, LOGIN, REG, UPLOAD, PRESIGN, PROC, READY, RESET, FAILED, CHANNEL]
  .forEach((n) => p.push(n.svg));

// ── Cạnh: 18 cạnh, đúng bằng bản Mermaid ────────────────────────────────────
// Vào trang
p.push(edge([[cx1, START.box.b], [cx1, HOME.box.y]]));
// Nhãn đẩy sang phải và lên trên: đặt giữa đoạn thì nền trắng của nó liếm vào
// góc phải hộp Catalogue page, thấy rõ thành một vết khuyết trên viền.
p.push(edge([[HOME.box.r, HOME.box.cy], [cx2, HOME.box.cy], [cx2, AUTH.box.t]],
  { label: 'chooses to upload', labelDx: 30, labelDy: -11 }));

// Làn công khai chạy dọc cột trái, không cắt qua hộp nào vì cột để trống.
p.push(edge([[cx1, HOME.box.b], [cx1, WATCH.box.y]]));

// Nhánh tài khoản
p.push(edge([[AUTH.box.cx, AUTH.box.b], [LOGIN.box.cx, LOGIN.box.y]], { label: 'no' }));
p.push(edge([[LOGIN.box.cx, LOGIN.box.b], [REG.box.cx, REG.box.y]], { label: 'no account' }));
// Vòng xuống rồi sang ngang, KHÔNG đi vòng ra mép phải. Bản trước cho đường
// này chạy tới x=692, đúng bằng mép phải của chính hộp RESET, nên đoạn cuối dài
// bằng 0 và hướng mũi tên thành không xác định — SVG không báo lỗi, chỉ vẽ ra
// một đầu mũi tên quay lung tung.
p.push(edge([[LOGIN.box.cx + 60, LOGIN.box.b], [LOGIN.box.cx + 60, 400],
             [RESET.box.cx, 400], [RESET.box.cx, RESET.box.y]],
  { label: 'forgot password' }));
// Quay lại đăng nhập sau khi đặt lại mật khẩu: rãnh giữa hai cột phải.
p.push(edge([[RESET.box.x, RESET.box.cy], [C3 - 20, RESET.box.cy],
             [C3 - 20, LOGIN.box.cy + 16], [LOGIN.box.r, LOGIN.box.cy + 16]]));

// Ba đường cùng dẫn tới trang tải lên
p.push(edge([[REG.box.cx, REG.box.b], [UPLOAD.box.cx, UPLOAD.box.y]]));
p.push(edge([[LOGIN.box.x, LOGIN.box.cy], [GUTTER_L, LOGIN.box.cy],
             [GUTTER_L, UPLOAD.box.cy], [UPLOAD.box.x, UPLOAD.box.cy]]));
p.push(edge([[AUTH.box.r, AUTH.box.cy], [GUTTER_R, AUTH.box.cy],
             [GUTTER_R, UPLOAD.box.cy - 16], [UPLOAD.box.r, UPLOAD.box.cy - 16]],
  { label: 'yes', labelAt: 0.12 }));

// Tải lên rồi chờ xử lý
p.push(edge([[UPLOAD.box.cx, UPLOAD.box.b], [PRESIGN.box.cx, PRESIGN.box.y]]));
p.push(edge([[PRESIGN.box.cx, PRESIGN.box.b], [PROC.box.cx, PROC.box.y]]));

// Ba kết cục của việc chuyển mã
p.push(edge([[PROC.box.cx, PROC.box.b], [READY.box.cx, READY.box.y]],
  { label: 'pipeline completes', labelDy: 2 }));
// Xuống trước rồi mới sang ngang. Bản trước rẽ ngang ngay từ mép phải PROC, nên
// nhãn rơi vào đoạn dọc sát hộp và nền trắng của nhãn sơn đè lên dòng chữ "on
// the owner's channel". Nhãn vẽ sau cùng nên nó luôn thắng, không phải lỗi độ
// trong suốt mà là lỗi thứ tự vẽ.
p.push(edge([[PROC.box.cx + 60, PROC.box.b], [PROC.box.cx + 60, 790],
             [FAILED.box.cx, 790], [FAILED.box.cx, FAILED.box.y]],
  { label: 'transcoding fails' }));
p.push(edge([[PROC.box.r, PROC.box.cy], [GUTTER_R, PROC.box.cy],
             [GUTTER_R, CHANNEL.box.cy], [CHANNEL.box.r, CHANNEL.box.cy]]));
p.push(edge([[FAILED.box.cx, FAILED.box.b], [CHANNEL.box.cx, CHANNEL.box.y]]));

// Hội tụ về trang xem
// Hai cạnh này vào cùng mép phải của WATCH nên phải tách nhau ra theo chiều
// dọc. Dùng toạ độ tuyệt đối chứ không lấy theo tâm hộp: WATCH cao 76 còn
// CHANNEL cao 58, nên `cy` của chúng lệch nhau 9px và cạnh nối hai tâm sẽ hơi
// xiên — đủ để nhìn ra là vẽ ẩu chứ chưa đủ để tưởng là cố ý.
p.push(edge([[READY.box.x, READY.box.cy], [GUTTER_L, READY.box.cy],
             [GUTTER_L, 920], [WATCH.box.r, 920]]));
p.push(edge([[CHANNEL.box.x, 952], [WATCH.box.r, 952]]));

// ── Chú giải ────────────────────────────────────────────────────────────────
p.push(colorLegend(C1, 1024, [
  { tone: 'storage', label: 'open to anyone' },
  { tone: 'compute', label: 'account' },
  { tone: 'network', label: 'video owner' },
  { tone: 'secret', label: 'branch or failure' },
]));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('08-user-flow', svg, 3);
console.log(`08-user-flow -> ${(out.bytes / 1024).toFixed(0)} KB, copied=${out.copied}`);
