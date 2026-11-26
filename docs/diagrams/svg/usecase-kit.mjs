/**
 * Drawing kit for the three use case diagrams (Figures 3.1 to 3.3).
 *
 * The look follows the textbook style the owner chose: blue filled ellipses, thin stick figures
 * with plain labels, a solid system boundary with a centred bold title, straight association lines
 * from the actor to the use case, and dashed «include» / «extend» arrows with an open head and the
 * keyword on the line. Generalisation between actors uses a hollow triangle (UML 2.5.1, 9.9.7).
 *
 * Association lines end at the left or right vertex of the ellipse, never at its centre: a line
 * aimed at the centre of a use case low in the column clips the ellipse above it, while the
 * vertices of one column all sit on the same x, so a fan of lines never enters any ellipse.
 *
 * Edge keywords are queued and drawn last, so a later line cannot paint over an earlier label.
 */

export const STYLE = {
  fill: '#6cb0ff',
  stroke: '#4f97ec',
  ink: '#111111',
  line: '#222222',
  frame: '#6b7280',
  muted: '#4b5563',
  font: 'Arial, Helvetica, sans-serif',
};

const LABELS = [];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lines(str, x, y, { size, lh = size * 1.2, weight = 'normal', fill = STYLE.ink, anchor = 'middle' }) {
  const arr = Array.isArray(str) ? str : [str];
  return arr.map((l, i) =>
    `<text x="${x}" y="${(y + i * lh).toFixed(1)}" font-family="${STYLE.font}" font-size="${size}" ` +
    `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`).join('');
}

/** Markers: open arrowhead for «include»/«extend», hollow triangle for generalisation. */
export function defs() {
  return `<defs>
  <marker id="uc-open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto">
    <path d="M 1 1 L 11 6 L 1 11" fill="none" stroke="${STYLE.line}" stroke-width="1.4"/>
  </marker>
  <marker id="uc-gen" viewBox="0 0 16 16" refX="15" refY="8" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto">
    <path d="M 1 1 L 15 8 L 1 15 z" fill="#ffffff" stroke="${STYLE.line}" stroke-width="1.4"/>
  </marker>
</defs>`;
}

/** System boundary: solid rounded rectangle with the subject's name centred at the top. */
export function boundary({ x, y, w, h, title, size }) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#ffffff" stroke="${STYLE.frame}" stroke-width="1.6"/>` +
    lines(title, x + w / 2, y + size + 12, { size: size + 2, weight: 'bold' });
}

/** Use case: filled ellipse with a centred label of one or two lines. */
export function useCase({ cx, cy, rx, ry, label, size, lh = size * 1.18 }) {
  const arr = Array.isArray(label) ? label : [label];
  const y0 = cy + size * 0.36 - ((arr.length - 1) * lh) / 2;
  const svg = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${STYLE.fill}" stroke="${STYLE.stroke}" stroke-width="1"/>` +
    lines(arr, cx, y0, { size, lh });
  return {
    svg, cx, cy, rx, ry,
    l: [cx - rx, cy], r: [cx + rx, cy], t: [cx, cy - ry], b: [cx, cy + ry],
  };
}

/** UML actor: stick figure, name below in plain type. `cy` is the height of the arms. */
export function actor({ cx, cy, label, size, lh = size * 1.18 }) {
  const arr = Array.isArray(label) ? label : [label];
  const s = STYLE.line;
  const sw = 1.6;
  const headCy = cy - 25;
  const svg = [
    `<circle cx="${cx}" cy="${headCy}" r="13" fill="#ffffff" stroke="${s}" stroke-width="${sw}"/>`,
    `<path d="M ${cx} ${headCy + 13} L ${cx} ${cy + 22}" stroke="${s}" stroke-width="${sw}"/>`,
    `<path d="M ${cx - 20} ${cy} L ${cx + 20} ${cy}" stroke="${s}" stroke-width="${sw}"/>`,
    `<path d="M ${cx} ${cy + 22} L ${cx - 16} ${cy + 48}" stroke="${s}" stroke-width="${sw}"/>`,
    `<path d="M ${cx} ${cy + 22} L ${cx + 16} ${cy + 48}" stroke="${s}" stroke-width="${sw}"/>`,
    lines(arr, cx, cy + 48 + size + 6, { size, lh }),
  ].join('');
  return {
    svg, cx, cy,
    r: [cx + 20, cy], l: [cx - 20, cy],
    top: headCy - 13,
    bottom: cy + 48 + size + 6 + (arr.length - 1) * lh + size * 0.3,
  };
}

const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

/** Association between an actor and a use case: a plain line, no arrowhead. */
export function assoc(...pts) {
  return `<path d="${path(pts)}" fill="none" stroke="${STYLE.line}" stroke-width="1.3"/>`;
}

/**
 * «include» or «extend»: dashed line with an open arrowhead. The arrow points from the base to the
 * included use case for «include», and from the extension to the base for «extend».
 * The keyword sits on the longest segment at `at` (0..1), on a white patch that breaks the line.
 */
export function rel(pts, { kind, size, at = 0.5, dx = 0, dy = 0 }) {
  let best = 0, bestLen = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (len > bestLen) { bestLen = len; best = i; }
  }
  const [a, b] = [pts[best], pts[best + 1]];
  const lx = a[0] + (b[0] - a[0]) * at + dx;
  const ly = a[1] + (b[1] - a[1]) * at + dy;
  const text = `«${kind}»`;
  const w = text.length * size * 0.56 + 10;
  const h = size + 6;
  LABELS.push(`<rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" fill="#ffffff"/>` +
    lines(text, lx, ly + size * 0.36, { size }));
  return `<path d="${path(pts)}" fill="none" stroke="${STYLE.line}" stroke-width="1.3" stroke-dasharray="7 5" marker-end="url(#uc-open)"/>`;
}

/** Generalisation between actors: solid line, hollow triangle at the general actor. */
export function gen(...pts) {
  return `<path d="${path(pts)}" fill="none" stroke="${STYLE.line}" stroke-width="1.3" marker-end="url(#uc-gen)"/>`;
}

export function note(str, x, y, size) {
  return lines(str, x, y, { size, lh: size * 1.28, anchor: 'start', fill: STYLE.muted });
}

/** Queued keywords; append after every line has been drawn. */
export function labels() {
  return LABELS.join('');
}
