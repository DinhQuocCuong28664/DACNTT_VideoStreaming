/**
 * Bộ dựng sơ đồ kiến trúc dạng SVG, có icon chính thức của từng dịch vụ.
 *
 * Vì sao không dùng Mermaid cho những sơ đồ này: Mermaid chỉ nhận icon qua lệnh
 * `registerIconPacks`, là một lời gọi JavaScript mà mermaid-cli không phơi ra,
 * nên chạy qua CLI thì mọi icon đều thành dấu hỏi. Ngoài ra, bố cục tự động của
 * Mermaid không đặt được các khối lồng nhau theo đúng ranh giới triển khai mà
 * sơ đồ cần thể hiện. Ở đây toạ độ do người viết đặt, đổi lại là kiểm soát được
 * hoàn toàn và kết quả ổn định qua mỗi lần dựng.
 *
 * Các sơ đồ còn lại (tuần tự, ERD, use case, luồng người dùng) vẫn giữ Mermaid
 * vì đó là những loại sơ đồ Mermaid làm tốt và không cần icon.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = JSON.parse(fs.readFileSync(path.join(HERE, 'icons.json'), 'utf8'));

export const PALETTE = {
  ink: '#1a1a1a',
  muted: '#5b6470',
  line: '#4a5568',
  storage: { fill: '#e8f4f8', stroke: '#2c7a9e' },
  compute: { fill: '#fff4e6', stroke: '#d98324' },
  network: { fill: '#eef7ee', stroke: '#3d8b40' },
  secret: { fill: '#fdecea', stroke: '#c0392b' },
  plain: { fill: '#f7f8fa', stroke: '#98a2b3' },
  groupStroke: '#8a94a6',
  groupFill: '#fbfcfd',
};

/**
 * Bang co chu, tinh bang px tren canvas.
 *
 * Co chu hien ra tren giay khong phai la con so o day, ma la
 * `font_px / canvas_px x be_rong_in_ra`. Vi vay hai hinh co canvas rong khac
 * nhau dung chung mot con so se cho ra hai co chu khac nhau khi in: hinh kien
 * truc rong 1740px in ra 247mm thi 13px chi con 5,2pt, trong khi hinh HLS rong
 * 792px in ra 136mm thi cung 13px lai duoc 6,3pt.
 *
 * Hinh nao co canvas rong thi ghi de bang o dau tep, kem phep tinh, thay vi sua
 * trong than ham va lam anh huong toi bay hinh con lai. Moi tep .mjs la mot tien
 * trinh rieng dung dung mot hinh, nen ghi de o day khong ro ri sang hinh khac.
 */
/**
 * Nhan cua cac canh duoc gom lai day va ve sau cung.
 *
 * Truoc day moi canh tu ve nhan cua no ngay tai cho, nen mot canh khai bao sau
 * se son de len nhan cua canh khai bao truoc: trong hinh kien truc, duong
 * "6 upload straight to S3" chay qua lan doc x=300 va gach thang qua chu
 * "pre-signed" cua nhan phia tren. Nen trang cua nhan khong cuu duoc, vi van de
 * la thu tu ve chu khong phai do trong suot.
 *
 * Moi tep .mjs la mot tien trinh rieng chi dung mot hinh, nen hang doi o cap
 * module khong ro ri sang hinh khac.
 */
const LABELS = [];

/**
 * Sổ đăng ký hình học, để đặt huy hiệu và kiểm bố cục sau khi mọi thứ đã khai báo.
 *
 * Nhãn cạnh viết kiểu "ở giữa đoạn dài nhất" sẽ đè lên viền thẻ mỗi khi đoạn đó ngắn hơn
 * nhãn: nền trắng của nhãn xoá luôn viền và cả chữ của thẻ bên cạnh. Hình kiến trúc có 15 trong
 * 18 nhãn dính lỗi đó. Muốn trị tận gốc thì phải biết vị trí mọi thẻ và mọi cạnh lúc đặt nhãn,
 * mà lúc đó người viết chưa khai báo hết, nên đặt nhãn dồn lại đến lúc dựng tài liệu.
 *
 * Mỗi tệp .mjs là một tiến trình riêng chỉ dựng một hình, nên sổ này ở cấp module không rò
 * sang hình khác.
 */
const BOXES = [];        // thẻ và khung: { kind, x, y, w, h, title? }
const EDGES = [];        // đa tuyến của mọi cạnh: { id, points }
const LABEL_RECTS = [];  // nhãn chữ trên cạnh: { text, x, y, w, h, edge }
const BADGES = [];       // huy hiệu số chờ đặt: { id, n, points, at }
let LAYOUT_CHECK = false;

export const TYPE = {
  cardTitle: 16,
  cardSub: 13.5,
  cardSubLH: 16.5,
  groupLabel: 15,
  edgeLabel: 13,
  legendLabel: 13.5,
  chipLabel: 13,
  chipLabelLH: 15,
  barLabel: 13,
  usecaseLabel: 15,
  usecaseLabelLH: 18,
  actorLabel: 14,
  actorLabelLH: 17,
  entityName: 16,
  entityRow: 13,
  entityKey: 12,
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Nhúng một icon iconify, giữ nguyên tỉ lệ khung hình.
 *
 * Các logo trong bộ này không vuông: Cloudflare rộng gấp hơn hai lần chiều cao,
 * MongoDB thì cao hơn rộng. Nếu scale riêng từng trục cho vừa một ô vuông thì
 * logo bị bóp méo, nhìn ra ngay và làm hỏng cảm giác chuyên nghiệp của sơ đồ.
 * Vì vậy scale đều theo cạnh dài rồi căn giữa trong ô `size` x `size`, `x` và
 * `y` là góc trên trái của ô đó.
 */
function icon(name, x, y, size) {
  const ic = ICONS.icons[name];
  if (!ic) throw new Error(`Khong co icon "${name}" trong icons.json`);
  const k = size / Math.max(ic.width, ic.height);
  const dx = x + (size - ic.width * k) / 2;
  const dy = y + (size - ic.height * k) / 2;
  return `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${k.toFixed(5)})">${ic.body}</g>`;
}

/**
 * Như `icon` nhưng không nhét vào ô vuông: scale theo cạnh dài rồi trả về đúng
 * bề rộng và chiều cao sau khi scale, căn giữa quanh `cx`, mép trên đặt tại `y`.
 *
 * Cần thiết cho logo dạng chữ. FFmpeg rộng 512 cao 138, tức rộng gần gấp bốn
 * lần chiều cao; căn giữa nó trong ô vuông cạnh `size` sẽ chừa ra hai khoảng
 * trắng, mỗi khoảng cao hơn chính cái logo. Trả về `h` để chỗ gọi biết đặt dòng
 * kế tiếp ở đâu thay vì đoán.
 */
function iconDims(name, size) {
  const ic = ICONS.icons[name];
  if (!ic) throw new Error(`Khong co icon "${name}" trong icons.json`);
  const k = size / Math.max(ic.width, ic.height);
  return { ic, k, w: ic.width * k, h: ic.height * k };
}

function iconTight(name, cx, y, size) {
  const { ic, k, w, h } = iconDims(name, size);
  const dx = cx - w / 2;
  return {
    svg: `<g transform="translate(${dx.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(5)})">${ic.body}</g>`,
    w, h,
  };
}

function textLines(str, x, y, opts = {}) {
  const {
    size = 14, weight = 'normal', fill = PALETTE.ink,
    anchor = 'middle', lineHeight = size * 1.25, family = 'Arial, Helvetica, sans-serif',
  } = opts;
  const lines = Array.isArray(str) ? str : [str];
  return lines
    .map((l, i) =>
      `<text x="${x}" y="${(y + i * lineHeight).toFixed(1)}" font-family="${family}" font-size="${size}" ` +
      `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`)
    .join('');
}

/**
 * Thẻ một thành phần: icon ở trên, tên đậm ở dưới, chú thích nhỏ tuỳ chọn.
 * Trả về cả hình vẽ lẫn hộp bao, để cạnh nối bám vào mép thẻ chứ không phải
 * vào một toạ độ đoán chừng.
 *
 * Bỏ `title` thì chính logo đứng thay cho tên, và được phóng to lên cỡ
 * `iconSize`. Dùng cho những logo bản thân đã là chữ, như FFmpeg: vẽ logo rồi
 * viết thêm dòng "FFmpeg" ngay dưới là in cùng một từ hai lần, mà lần nào cũng
 * nhỏ đi vì phải chia chỗ cho lần kia.
 */
export function card(spec) {
  const {
    x, y, w = 168, h = 104, iconName, title, sub, tone = 'plain', iconSize = 34,
  } = spec;
  const c = PALETTE[tone] ?? PALETTE.plain;
  BOXES.push({ kind: 'card', x, y, w, h });

  const parts = [];
  parts.push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ` +
    `fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/>`);

  const cx = x + w / 2;
  let cursor = y + 12;  // đường cơ sở cho phần sẽ vẽ tiếp

  if (iconName && !title) {
    // Không có dòng tiêu đề thì cũng không còn cái neo quen thuộc để căn theo,
    // nên căn giữa cả khối logo cộng chú thích trong thẻ. Tính từ mép trên logo
    // xuống hết phần chữ thò xuống của chú thích, chứ không tính theo đường cơ
    // sở, nếu không thẻ sẽ nặng phần trên.
    const GAP = 22;
    const dim = iconDims(iconName, iconSize);
    const blockH = dim.h + (sub ? GAP + 3 : 0);
    const top = y + (h - blockH) / 2;
    parts.push(iconTight(iconName, cx, top, iconSize).svg);
    cursor = top + dim.h + GAP;
  } else {
    if (iconName) parts.push(icon(iconName, cx - iconSize / 2, cursor, iconSize));
    cursor += iconName ? iconSize + 20 : 26;
    const titles = Array.isArray(title) ? title : [title];
    parts.push(textLines(titles, cx, cursor, { size: TYPE.cardTitle, weight: 'bold' }));
    cursor += titles.length * 20 + 3;
  }

  if (sub) {
    parts.push(textLines(sub, cx, cursor, { size: TYPE.cardSub, fill: PALETTE.muted, lineHeight: TYPE.cardSubLH }));
  }

  return {
    svg: parts.join(''),
    box: { x, y, w, h, cx, cy: y + h / 2, r: x + w, b: y + h },
  };
}

/** Khối bao nét đứt kèm nhãn, dùng cho ranh giới tài khoản hoặc tầng hệ thống. */
export function group(spec) {
  const { x, y, w, h, label, stroke = PALETTE.groupStroke, fill = PALETTE.groupFill, dash = '7 5', iconName } = spec;
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" ` +
    `stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${dash}"/>`,
  ];
  const lx = x + 16;
  const titleLines = Array.isArray(label) ? label : [label];
  const titleW = Math.max(...titleLines.map((l) => String(l).length)) * TYPE.groupLabel * 0.6 + (iconName ? 30 : 0);
  BOXES.push({
    kind: 'group', x, y, w, h,
    title: { x: lx - 2, y: y + 8, w: titleW + 4, h: 26 + (titleLines.length - 1) * TYPE.groupLabel * 1.25 },
  });
  if (iconName) {
    parts.push(icon(iconName, lx, y + 10, 20));
    parts.push(textLines(label, lx + 30, y + 26, { size: TYPE.groupLabel, weight: 'bold', anchor: 'start', fill: stroke }));
  } else {
    parts.push(textLines(label, lx, y + 26, { size: TYPE.groupLabel, weight: 'bold', anchor: 'start', fill: stroke }));
  }
  return { svg: parts.join(''), box: { x, y, w, h, r: x + w, b: y + h } };
}

/**
 * Cạnh nối theo các điểm gãy cho sẵn. Không dùng định tuyến tự động: sơ đồ này
 * ít cạnh nhưng nhiều khối lồng nhau, nên đặt tay cho kết quả sạch hơn và
 * không đổi bố cục sau mỗi lần dựng.
 */
export function edge(points, opts = {}) {
  const {
    label, dashed = false, color = PALETTE.line, labelAt = 0.5,
    labelDx = 0, labelDy = -7, width = 1.8, arrow = true, labelBg = true,
    badge = null, badgeAt = 0.5,
  } = opts;

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const id = EDGES.length;
  EDGES.push({ id, points });
  const parts = [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ` +
    `${dashed ? 'stroke-dasharray="6 4" ' : ''}${arrow ? 'marker-end="url(#arrow)"' : ''}/>`,
  ];

  // Huy hiệu số: không vẽ nhãn chữ, chỗ đặt do placeBadges() chọn lúc dựng tài liệu.
  if (badge != null) {
    BADGES.push({ id, n: badge, points, at: badgeAt });
    return parts.join('');
  }

  if (label) {
    // Đặt nhãn trên đoạn dài nhất để chữ không đè lên chỗ đường gãy.
    let best = 0, bestLen = -1;
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      if (len > bestLen) { bestLen = len; best = i; }
    }
    const a = points[best], b = points[best + 1];
    const lx = a[0] + (b[0] - a[0]) * labelAt + labelDx;
    const ly = a[1] + (b[1] - a[1]) * labelAt + labelDy;
    const text = String(label);
    const lab = [];
    const rectW = text.length * TYPE.edgeLabel * (7.2 / 13) + 14;
    const rectH = TYPE.edgeLabel * (19 / 13);
    LABEL_RECTS.push({ text, x: lx - rectW / 2, y: ly - TYPE.edgeLabel, w: rectW, h: rectH, edge: id });
    if (labelBg) {
      // Nen tray phai co dan theo co chu. Truoc day be rong la
      // `text.length * 7.2 + 14`, do dac cho co chu 13px; hinh kien truc nang
      // nhan len 15,5px thi chu tho ra khoi tam nen va cac duong doc ke sau
      // gach thang qua giua chu. Giu nguyen ti le do duoc o 13px nen cac hinh
      // khong doi co chu van dung ra y het nhu cu.
      const wpx = text.length * TYPE.edgeLabel * (7.2 / 13) + 14;
      const hpx = TYPE.edgeLabel * (19 / 13);
      lab.push(`<rect x="${(lx - wpx / 2).toFixed(1)}" y="${(ly - TYPE.edgeLabel).toFixed(1)}" width="${wpx.toFixed(1)}" ` +
        `height="${hpx.toFixed(1)}" rx="4" fill="#ffffff" fill-opacity="0.93"/>`);
    }
    lab.push(textLines(text, lx, ly, { size: TYPE.edgeLabel, fill: PALETTE.muted }));
    LABELS.push(lab.join(''));
  }
  return parts.join('');
}

/** Chú giải các kiểu đường nét dùng trong sơ đồ. */
export function legend(x, y, entries) {
  const parts = [];
  let cx = x;
  for (const e of entries) {
    parts.push(`<path d="M ${cx} ${y} L ${cx + 30} ${y}" stroke="${e.color ?? PALETTE.line}" stroke-width="1.8" ` +
      `${e.dashed ? 'stroke-dasharray="6 4" ' : ''}marker-end="url(#arrow)"/>`);
    parts.push(textLines(e.label, cx + 38, y + 5, { size: TYPE.legendLabel, anchor: 'start', fill: PALETTE.muted }));
    cx += 38 + e.label.length * 7.3 + 34;
  }
  return parts.join('');
}

/**
 * Chip một bước trong quy trình: nhỏ hơn `card`, icon nằm bên trái chữ.
 * Dùng cho sơ đồ CI/CD, nơi một hàng có tới năm bước nối tiếp nên thẻ vuông
 * kiểu `card` sẽ không đủ chỗ.
 */
export function chip(spec) {
  const { x, y, w = 150, h = 46, iconName, label, tone = 'plain', iconSize = 20 } = spec;
  const c = PALETTE[tone] ?? PALETTE.plain;
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ` +
    `fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4"/>`,
  ];

  const lines = Array.isArray(label) ? label : [label];
  const textX = iconName ? x + iconSize + 20 : x + w / 2;
  const anchor = iconName ? 'start' : 'middle';
  if (iconName) parts.push(icon(iconName, x + 11, y + (h - iconSize) / 2, iconSize));

  const startY = y + h / 2 + (lines.length === 1 ? 4.5 : -2);
  parts.push(textLines(lines, textX, startY, { size: TYPE.chipLabel, anchor, lineHeight: TYPE.chipLabelLH }));

  return {
    svg: parts.join(''),
    box: { x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h },
  };
}

/**
 * Thanh tỉ lệ hai phần, dùng để so sánh hai đại lượng chênh nhau rất xa.
 * Với mức sử dụng 0,5% thì một con số trong bảng không gây ấn tượng gì, còn
 * một dải gần như trống thì nói ngay được vấn đề.
 */
export function bar(spec) {
  const {
    x, y, w, h = 26, fraction, fillColor = PALETTE.compute.stroke,
    trackColor = '#e6e9ee', label, valueLabel,
  } = spec;
  const fillW = Math.max(w * fraction, 2);
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${trackColor}"/>`,
    `<rect x="${x}" y="${y}" width="${fillW.toFixed(2)}" height="${h}" rx="5" fill="${fillColor}"/>`,
  ];
  if (label) parts.push(textLines(label, x, y - 9, { size: TYPE.barLabel, anchor: 'start', fill: PALETTE.muted }));
  if (valueLabel) {
    parts.push(textLines(valueLabel, x + w, y - 9, { size: TYPE.barLabel, anchor: 'end', fill: PALETTE.ink, weight: 'bold' }));
  }
  return { svg: parts.join(''), box: { x, y, w, h, r: x + w, b: y + h } };
}

/**
 * Use case theo đúng ký hiệu UML: hình ellipse, không phải hình chữ nhật.
 *
 * Bản Mermaid trước vẽ bằng hình chữ nhật vì Mermaid không có kiểu sơ đồ use
 * case, hình đó là một flowchart giả lập. Ký hiệu sai làm người chấm phải đoán
 * xem đâu là use case, đâu là bước xử lý.
 */
export function usecase(spec) {
  const { cx, cy, rx = 156, ry = 40, label, tone = 'network' } = spec;
  const c = PALETTE[tone] ?? PALETTE.network;
  const lines = Array.isArray(label) ? label : [label];
  const startY = cy + (lines.length === 1 ? 5 : -3);

  const svg =
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c.fill}" ` +
    `stroke="${c.stroke}" stroke-width="1.6"/>` +
    textLines(lines, cx, startY, { size: TYPE.usecaseLabel, lineHeight: TYPE.usecaseLabelLH });

  return { svg, box: { cx, cy, l: cx - rx, r: cx + rx, t: cy - ry, b: cy + ry, rx, ry } };
}

/** Tác nhân UML: hình người que kèm tên phía dưới. */
export function actor(spec) {
  const { cx, cy, label, scale = 1, color = PALETTE.ink } = spec;
  const s = scale;
  const head = 9 * s;
  const bodyTop = cy - 6 * s;
  const bodyBottom = cy + 20 * s;

  const parts = [
    `<circle cx="${cx}" cy="${cy - 17 * s}" r="${head}" fill="none" stroke="${color}" stroke-width="1.8"/>`,
    `<path d="M ${cx} ${bodyTop} L ${cx} ${bodyBottom}" stroke="${color}" stroke-width="1.8"/>`,
    `<path d="M ${cx - 15 * s} ${cy + 2 * s} L ${cx + 15 * s} ${cy + 2 * s}" stroke="${color}" stroke-width="1.8"/>`,
    `<path d="M ${cx} ${bodyBottom} L ${cx - 12 * s} ${bodyBottom + 18 * s}" stroke="${color}" stroke-width="1.8"/>`,
    `<path d="M ${cx} ${bodyBottom} L ${cx + 12 * s} ${bodyBottom + 18 * s}" stroke="${color}" stroke-width="1.8"/>`,
  ];

  const lines = Array.isArray(label) ? label : [label];
  parts.push(textLines(lines, cx, bodyBottom + 18 * s + 22, { size: TYPE.actorLabel, weight: 'bold', lineHeight: TYPE.actorLabelLH }));

  return {
    svg: parts.join(''),
    box: { cx, cy, r: cx + 16 * s, l: cx - 16 * s, b: bodyBottom + 18 * s + 22 + lines.length * 17 },
  };
}

/**
 * Liên kết giữa tác nhân và use case: đường thẳng, KHÔNG có đầu mũi tên.
 * UML chỉ dùng mũi tên cho quan hệ include và extend.
 */
export function assoc(points, opts = {}) {
  const { color = PALETTE.line, width = 1.5 } = opts;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
}

/**
 * Bảng thực thể cho sơ đồ ERD: tiêu đề, rồi mỗi thuộc tính một dòng gồm kiểu,
 * tên, khoá và ghi chú.
 *
 * Tự vẽ thay vì dùng `erDiagram` của Mermaid vì Mermaid xếp các bảng cạnh nhau
 * theo chiều cao lớn nhất, mà ở đây bảng VIDEO có hai mươi dòng còn USER chỉ có
 * mười bốn, nên gần bốn mươi phần trăm khung hình là khoảng trắng. Khung to hơn
 * nội dung cần thì khi thu vừa trang chữ bị nhỏ theo.
 */
export function entity(spec) {
  const {
    x, y, name, rows, w = 470,
    colType = 112, colName = 150, colKey = 44,
    rowH = 27, headH = 34, tone = 'storage',
  } = spec;
  const c = PALETTE[tone] ?? PALETTE.storage;
  const h = headH + rows.length * rowH;
  const parts = [];

  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#ffffff" ` +
    `stroke="${c.stroke}" stroke-width="1.6"/>`);
  parts.push(`<path d="M ${x} ${y + headH} h ${w}" stroke="${c.stroke}" stroke-width="1.6"/>`);
  parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${headH}" rx="6" fill="${c.fill}"/>`);
  parts.push(`<rect x="${x}" y="${y + headH - 8}" width="${w}" height="8" fill="${c.fill}"/>`);
  parts.push(textLines(name, x + w / 2, y + 23, { size: TYPE.entityName, weight: 'bold' }));

  rows.forEach((r, i) => {
    const ry = y + headH + i * rowH;
    if (i % 2 === 1) {
      parts.push(`<rect x="${x + 1}" y="${ry}" width="${w - 2}" height="${rowH}" fill="#f7f9fb"/>`);
    }
    const ty = ry + rowH / 2 + 4.5;
    parts.push(textLines(r.type, x + 12, ty, { size: TYPE.entityRow, anchor: 'start', fill: PALETTE.muted }));
    parts.push(textLines(r.name, x + 12 + colType, ty, { size: TYPE.entityRow, anchor: 'start' }));
    if (r.key) {
      parts.push(textLines(r.key, x + 12 + colType + colName + colKey / 2, ty,
        { size: TYPE.entityKey, weight: 'bold', fill: c.stroke }));
    }
    if (r.note) {
      parts.push(textLines(r.note, x + 12 + colType + colName + colKey + 8, ty,
        { size: TYPE.entityKey, anchor: 'start', fill: PALETTE.muted }));
    }
  });

  return {
    svg: parts.join(''),
    box: { x, y, w, h, r: x + w, b: y + h, cx: x + w / 2, cy: y + h / 2 },
    rowY: (i) => y + headH + i * rowH + rowH / 2,
  };
}

/** Nhãn chữ tự do, cho tiêu đề nhóm hoặc ghi chú ngoài thẻ. */
export function text(str, x, y, opts = {}) {
  return textLines(str, x, y, opts);
}

/** Xoá toàn bộ sổ đăng ký hình học. Chỉ dùng cho kiểm thử, vì mỗi hình thật chạy trong một tiến trình riêng. */
export function resetLayoutState() {
  for (const list of [LABELS, BOXES, EDGES, LABEL_RECTS, BADGES, PLACED]) list.length = 0;
  LAYOUT_CHECK = false;
}

/** Bật bước kiểm bố cục cho hình này: dựng hình mà có chỗ đè nhau thì báo lỗi và không ghi tệp. */
export function enableLayoutCheck() {
  LAYOUT_CHECK = true;
}

// ── Hình học cho việc đặt huy hiệu và kiểm bố cục ──────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function distPointRect(px, py, r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Khoảng cách tới đường viền của hình chữ nhật, tính cả khi điểm nằm trong. */
function distPointOutline(px, py, r) {
  const inside = px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  if (!inside) return distPointRect(px, py, r);
  return Math.min(px - r.x, r.x + r.w - px, py - r.y, r.y + r.h - py);
}

function distPointSeg(px, py, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 ? clamp(((px - a[0]) * vx + (py - a[1]) * vy) / len2, 0, 1) : 0;
  return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}

/** Đoạn thẳng a-b có cắt hình chữ nhật r không (Liang-Barsky). */
function segHitsRect(a, b, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - r.x, r.x + r.w - a[0], a[1] - r.y, r.y + r.h - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

const rectsHit = (a, b, pad = 0) =>
  !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x || a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);

const shrink = (r, d) => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });
const segmentsOf = (points) => points.slice(0, -1).map((a, i) => [a, points[i + 1]]);

const BADGE_R = 13;
const PLACED = [];   // huy hiệu đã đặt: { cx, cy, n }

/**
 * Đặt huy hiệu số lên các cạnh có khai báo `badge`.
 *
 * Với mỗi huy hiệu, thử các điểm cách nhau 3px dọc theo cạnh của nó, rồi cả hai bên cạnh
 * (khi đoạn quá ngắn để đặt ngay trên đường, như khe 36px giữa hai thẻ). Một điểm hợp lệ khi
 * vòng tròn không chạm thẻ, viền khung, tiêu đề khung, nhãn chữ, huy hiệu khác, và không nằm
 * trên đường của cạnh nào khác, cũng không che mũi tên của chính cạnh nó. Chọn điểm gần vị trí
 * ưa thích `at` nhất; huy hiệu ít chỗ lựa nhất được đặt trước.
 */
function placeBadges() {
  if (!BADGES.length) return '';
  const R = BADGE_R;
  const M = 4;                 // chừa quanh vòng tròn
  const OFF = R + 9;           // lệch ngang khi đặt cạnh đường
  const cards = BOXES.filter((b) => b.kind === 'card');
  const groups = BOXES.filter((b) => b.kind === 'group');

  const validAt = (bd, cx, cy, segIndex, offset) => {
    for (const c of cards) if (distPointRect(cx, cy, c) < R + M) return false;
    for (const g of groups) {
      if (distPointOutline(cx, cy, g) < R + M) return false;
      if (distPointRect(cx, cy, g.title) < R + M) return false;
    }
    for (const L of LABEL_RECTS) if (distPointRect(cx, cy, L) < R + M) return false;

    const own = EDGES[bd.id];
    const ownSegs = segmentsOf(own.points);
    for (let i = 0; i < ownSegs.length; i++) {
      if (i === segIndex) continue;
      if (distPointSeg(cx, cy, ownSegs[i][0], ownSegs[i][1]) < R + 2) return false;
    }
    for (const e of EDGES) {
      if (e.id === bd.id) continue;
      for (const [a, b] of segmentsOf(e.points)) {
        if (distPointSeg(cx, cy, a, b) < (offset ? OFF + 8 : R + M)) return false;
      }
    }
    const end = own.points[own.points.length - 1];
    if (Math.hypot(cx - end[0], cy - end[1]) < R + 14) return false;   // mũi tên
    return true;
  };

  const candidates = BADGES.map((bd) => {
    const segs = segmentsOf(bd.points);
    const total = segs.reduce((t, [a, b]) => t + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
    const list = [];
    let acc = 0;
    segs.forEach(([a, b], i) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) return;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      for (let s = 0; s <= len; s += 3) {
        for (const off of [0, OFF, -OFF]) {
          const cx = a[0] + ux * s - uy * off;
          const cy = a[1] + uy * s + ux * off;
          if (!validAt(bd, cx, cy, i, off !== 0)) continue;
          const score = Math.abs(acc + s - bd.at * total) + (off !== 0 ? 80 : 0);
          list.push({ cx, cy, score });
        }
      }
      acc += len;
    });
    list.sort((p, q) => p.score - q.score);
    return { bd, list };
  });

  const failures = [];
  const out = [];
  PLACED.length = 0;
  for (const { bd, list } of candidates.sort((p, q) => p.list.length - q.list.length)) {
    const spot = list.find((c) => PLACED.every((o) => Math.hypot(c.cx - o.cx, c.cy - o.cy) >= 2 * R + 6));
    if (!spot) {
      failures.push(`không có chỗ trống cho huy hiệu ${bd.n} (${list.length} điểm hợp lệ trước khi xét huy hiệu khác)`);
      continue;
    }
    PLACED.push({ cx: spot.cx, cy: spot.cy, n: bd.n });
    out.push(
      `<circle cx="${spot.cx.toFixed(1)}" cy="${spot.cy.toFixed(1)}" r="${R}" fill="#334155" stroke="#ffffff" stroke-width="2"/>` +
      `<text x="${spot.cx.toFixed(1)}" y="${(spot.cy + TYPE.edgeLabel * 0.35).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" ` +
      `font-size="${TYPE.edgeLabel}" font-weight="bold" fill="#ffffff" text-anchor="middle">${bd.n}</text>`);
  }
  if (failures.length) throw new Error(`Đặt huy hiệu thất bại:\n  ${failures.join('\n  ')}`);
  return out.join('');
}

/**
 * Bước kiểm bố cục: liệt kê mọi chỗ đè nhau thay vì để người đọc PDF tự phát hiện.
 * Chỉ chạy khi hình gọi enableLayoutCheck().
 */
function layoutViolations() {
  const v = [];
  const cards = BOXES.filter((b) => b.kind === 'card');
  const groups = BOXES.filter((b) => b.kind === 'group');
  const at = (r) => `(${Math.round(r.x)},${Math.round(r.y)})`;

  for (const g of groups) {
    if (g.title.x + g.title.w > g.x + g.w) v.push(`tiêu đề khung ${at(g)} rộng hơn chính khung`);
  }

  for (const L of LABEL_RECTS) {
    for (const c of cards) if (rectsHit(L, c)) v.push(`nhãn "${L.text}" đè lên thẻ ${at(c)}`);
    for (const g of groups) {
      if (rectsHit(L, g.title)) v.push(`nhãn "${L.text}" đè lên tiêu đề khung ${at(g)}`);
      if (rectsHit(L, g) && !(L.x >= g.x + 3 && L.y >= g.y + 3 && L.x + L.w <= g.x + g.w - 3 && L.y + L.h <= g.y + g.h - 3)) {
        v.push(`nhãn "${L.text}" cắt viền khung ${at(g)}`);
      }
    }
    for (const e of EDGES) {
      if (e.id === L.edge) continue;
      for (const [a, b] of segmentsOf(e.points)) {
        if (segHitsRect(a, b, L)) { v.push(`nhãn "${L.text}" nằm trên đường của một cạnh khác`); break; }
      }
    }
    for (const o of LABEL_RECTS) if (o !== L && rectsHit(L, o, 2) && L.text < o.text) v.push(`nhãn "${L.text}" chạm nhãn "${o.text}"`);
  }

  for (const e of EDGES) {
    for (const [a, b] of segmentsOf(e.points)) {
      for (const g of groups) if (segHitsRect(a, b, g.title)) v.push(`cạnh ${e.id} cắt tiêu đề khung ${at(g)}`);
      for (const c of cards) if (segHitsRect(a, b, shrink(c, 3))) v.push(`cạnh ${e.id} đi xuyên thẻ ${at(c)}`);
    }
  }
  return [...new Set(v)];
}

/** Ghép các phần thành một tài liệu SVG hoàn chỉnh. */
export function document_({ width, height, body, title }) {
  const badgeSvg = placeBadges();
  if (LAYOUT_CHECK) {
    const problems = layoutViolations();
    if (problems.length) {
      throw new Error(`Bố cục có ${problems.length} chỗ đè nhau:\n  - ${problems.join('\n  - ')}`);
    }
  }
  return documentSvg({ width, height, body: `${body}`, title, badgeSvg });
}

function documentSvg({ width, height, body, title, badgeSvg }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${PALETTE.line}"/>
  </marker>
</defs>
<rect width="${width}" height="${height}" fill="#ffffff"/>
${title ? textLines(title, width / 2, 34, { size: 18, weight: 'bold' }) : ''}
${body}
${LABELS.join('')}${badgeSvg}
</svg>`;
}

/**
 * Ghi SVG ra đĩa và rasterize ở độ phân giải gấp `scale` lần cho bản in.
 *
 * Ghi PNG ra cả hai nơi: `docs/diagrams/` để xem nhanh, và `report/images/` là
 * chỗ LaTeX thật sự đọc. Trước đây phải tự chép tay bước sau, mà quên chép thì
 * không có lỗi nào báo: lệnh dựng vẫn chạy xong, báo cáo vẫn biên dịch sạch, chỉ
 * là hình trong PDF vẫn là bản cũ. Kiểu sai đó chỉ lộ ra khi mở PDF nhìn tận
 * mắt, nên để máy chép luôn.
 */
export function write(name, svg, scale = 3) {
  const svgPath = path.join(HERE, `${name}.svg`);
  fs.writeFileSync(svgPath, svg);

  const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: true } })
    .render().asPng();
  const pngPath = path.join(HERE, '..', `${name}.png`);
  fs.writeFileSync(pngPath, png);

  const reportDir = path.join(HERE, '..', '..', '..', 'report', 'images');
  const copied = fs.existsSync(reportDir);
  if (copied) fs.writeFileSync(path.join(reportDir, `${name}.png`), png);

  return { svgPath, pngPath, bytes: png.length, copied };
}
