/**
 * Figure 2.2 - HLS: what is produced from one source, and how a player moves between renditions.
 *
 * The earlier version was a vertical chain of five cards (source, FFmpeg, ladder, master playlist,
 * player). It filled a page but showed only the order of the files, while the text beside it is about
 * adaptive switching: renditions cut on the same boundaries, the master playlist read first, and the
 * rendition changed only at a segment boundary as the measured throughput moves.
 *
 * This version uses the usual ABR illustration (renditions as rows, 6-second segments as columns, the
 * player's path through them, and the throughput that drives the path) under a short pipeline strip.
 * The ladder values are the ones of shared/src/ladder.ts and Table 4.2. The session is illustrative,
 * not a measurement; each choice is the highest rung whose cap fits 0.95 of the throughput measured
 * at that boundary, as hls.js does.
 *
 * Canvas 1100 px printed at about 135 mm (0.9 of the text width): 18 px type prints at 6.3 pt.
 */
import { card, edge, document_, write, TYPE, PALETTE } from './render.mjs';

Object.assign(TYPE, { cardTitle: 19, cardSub: 18, cardSubLH: 21, edgeLabel: 18 });

const SIZE = 18;
const W = 1100;
const H = 700;
const p = [];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const t = (str, x, y, { anchor = 'start', fill = '#1a1a1a', weight = 'normal', size = SIZE } = {}) =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" ` +
  `font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(str)}</text>`;

// ── Pipeline strip ────────────────────────────────────────────────────────────
const src = card({ x: 20, y: 16, w: 250, h: 112, title: 'Source file', sub: ['any container, codec', 'and resolution'], tone: 'storage' });
const enc = card({ x: 350, y: 16, w: 320, h: 112, title: 'FFmpeg, one run', sub: ['decodes once, encodes', 'up to six renditions'], tone: 'compute' });
const mst = card({ x: 750, y: 16, w: 330, h: 112, title: 'master.m3u8', sub: ['one entry per rendition', 'with its BANDWIDTH'], tone: 'network' });
p.push(src.svg, enc.svg, mst.svg);
p.push(edge([[src.box.r, 72], [enc.box.x, 72]]));
p.push(edge([[enc.box.r, 72], [mst.box.x, 72]]));

// ── Grid: renditions x segments ──────────────────────────────────────────────
const RUNGS = [ // rank 0 = lowest
  ['144p', 180], ['240p', 350], ['360p', 600], ['480p', 1100], ['720p', 2200], ['1080p', 4500],
];
const ROW_TOP = 196;
const ROW_H = 46;
const rowY = (rank) => ROW_TOP + (5 - rank) * ROW_H;   // centre of the row
const X0 = 275;
const COL = 88;
const N = 9;
const colX = (i) => X0 + i * COL;
const GRID_BOTTOM = rowY(0) + 23;

// Throughput at each boundary (kbit/s) and the rung chosen for the segment that starts there.
const TP = [1200, 1500, 2600, 5200, 5500, 1500, 900, 2800, 5600, 5800];
const pick = (kbps) => RUNGS.reduce((best, [, cap], r) => (cap <= 0.95 * kbps ? r : best), 0);
const PATH = [2, ...TP.slice(1, N).map(pick)];        // the first segment starts at 360p

p.push(edge([[enc.box.cx, enc.box.b], [enc.box.cx, ROW_TOP - 30]]));
p.push(t('writes each rendition', enc.box.cx + 10, 160, { fill: PALETTE.muted }));
p.push(edge([[mst.box.cx, mst.box.b], [mst.box.cx, ROW_TOP - 30]]));
p.push(t('read first by the player', mst.box.cx - 10, 160, { anchor: 'end', fill: PALETTE.muted }));

// Segment boundaries, shared by every rendition and by the throughput band.
for (let i = 0; i <= N; i++) {
  p.push(`<path d="M ${colX(i)} ${ROW_TOP - 26} L ${colX(i)} 612" stroke="#9aa4b2" stroke-width="1" stroke-dasharray="4 4"/>`);
}

for (let r = 0; r < RUNGS.length; r++) {
  const [name, cap] = RUNGS[r];
  p.push(t(`${name}  cap ${cap} kbit/s`, X0 - 14, rowY(r) + 6, { anchor: 'end' }));
  for (let i = 0; i < N; i++) {
    const on = PATH[i] === r;
    p.push(`<rect x="${colX(i) + 5}" y="${rowY(r) - 16}" width="${COL - 10}" height="32" rx="5" ` +
      `fill="${on ? '#6cb0ff' : '#f1f4f8'}" stroke="${on ? '#3f86dc' : '#cfd6df'}" stroke-width="${on ? 1.4 : 1}"/>`);
  }
}

// The player's path: stays in a row for a whole segment, changes rows only on a boundary.
const pts = [];
for (let i = 0; i < N; i++) {
  pts.push([colX(i) + COL / 2, rowY(PATH[i])]);
  if (i < N - 1) {
    pts.push([colX(i + 1), rowY(PATH[i])]);
    pts.push([colX(i + 1), rowY(PATH[i + 1])]);
  }
}
pts.push([colX(N) - 6, rowY(PATH[N - 1])]);
p.push(`<path d="${pts.map((q, k) => `${k ? 'L' : 'M'} ${q[0]} ${q[1]}`).join(' ')}" fill="none" stroke="#c2410c" stroke-width="3" stroke-linejoin="round"/>`);
pts.filter((_, k) => k % 3 === 0).forEach(([x, y]) => p.push(`<circle cx="${x}" cy="${y}" r="5" fill="#c2410c"/>`));

// Time axis
for (let i = 0; i <= N; i++) {
  p.push(t(i === 0 ? '0 s' : i === N ? `${6 * i} s` : String(6 * i), colX(i), GRID_BOTTOM + 26, { anchor: 'middle', fill: PALETTE.muted }));
}

// ── Throughput band ──────────────────────────────────────────────────────────
const BAND_TOP = 512;
const BAND_BOTTOM = 604;
const ty = (k) => BAND_BOTTOM - (k / 6000) * (BAND_BOTTOM - BAND_TOP);
p.push(`<path d="M ${X0} ${BAND_BOTTOM} L ${colX(N)} ${BAND_BOTTOM}" stroke="#9aa4b2" stroke-width="1"/>`);
p.push(`<path d="${TP.map((k, i) => `${i ? 'L' : 'M'} ${colX(i)} ${ty(k).toFixed(1)}`).join(' ')}" fill="none" stroke="#2c7a9e" stroke-width="2.6"/>`);
TP.forEach((k, i) => p.push(`<circle cx="${colX(i)}" cy="${ty(k).toFixed(1)}" r="4" fill="#2c7a9e"/>`));
p.push(t('Measured', X0 - 14, 548, { anchor: 'end' }));
p.push(t('throughput', X0 - 14, 570, { anchor: 'end' }));
p.push(t('(0 to 6 Mbit/s)', X0 - 14, 592, { anchor: 'end', fill: PALETTE.muted }));

// ── Key ──────────────────────────────────────────────────────────────────────
const KY = 648;
p.push(`<rect x="20" y="${KY - 14}" width="34" height="20" rx="4" fill="#6cb0ff" stroke="#3f86dc"/>`);
p.push(t('segment the player fetched', 62, KY + 2));
p.push(`<path d="M 330 ${KY - 4} L 372 ${KY - 4}" stroke="#c2410c" stroke-width="3"/>`);
p.push(t('rendition chosen, changed only at a boundary', 380, KY + 2));
p.push(`<path d="M 800 ${KY - 18} L 800 ${KY + 8}" stroke="#9aa4b2" stroke-dasharray="4 4"/>`);
p.push(t('same key frames in all', 812, KY + 2));
p.push(t('An illustrative session: each rendition is chosen from the throughput measured at the boundary before it.', 20, KY + 36, { fill: PALETTE.muted }));

const out = write('06-hls-abr', document_({ width: W, height: H, body: p.join('\n') }), 3);
console.log(`06-hls-abr -> ${(out.bytes / 1024).toFixed(0)} KB  path=${PATH.join(',')}`);
