/**
 * Hình 4.3 — Gói HLS của một video trong bucket processed, theo đúng đường dẫn và thẻ mà
 * shared/src/hls/playlist.ts và shared/src/paths.ts sinh ra. Khác Hình 2.2 (khái niệm chung):
 * hình này cho thấy thư mục thật, thẻ nào nằm ở playlist nào, và khoá đi qua API chứ không nằm
 * trong bucket processed.
 */
import { card, group, edge, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { cardTitle: 18, cardSub: 15.5, cardSubLH: 20, groupLabel: 17, edgeLabel: 15.5 });

const W = 1430;
const H = 800;
const p = [];

const bucket = group({ x: 40, y: 56, w: 990, h: 680, label: 'S3 processed: videos/{videoId}/v{uploadVersion}/', stroke: PALETTE.storage.stroke, fill: '#f5fafc' });
p.push(bucket.svg);

const master = card({ x: 70, y: 110, w: 300, h: 270, title: 'master.m3u8', sub: ['written last', '', 'one EXT-X-STREAM-INF', 'per rung, ascending:', 'BANDWIDTH (peak),', 'AVERAGE-BANDWIDTH,', 'RESOLUTION, FRAME-RATE,', 'CODECS'], tone: 'network' });
const r1080 = card({ x: 450, y: 110, w: 250, h: 74, title: '1080p/index.m3u8', tone: 'storage' });
const r720 = card({ x: 450, y: 208, w: 250, h: 74, title: '720p/index.m3u8', tone: 'storage' });
const rLow = card({ x: 450, y: 306, w: 250, h: 74, title: '… 144p/index.m3u8', tone: 'storage' });
const detail = card({ x: 760, y: 110, w: 250, h: 250, title: 'Media playlist', sub: ['TARGETDURATION:6', 'PLAYLIST-TYPE:VOD', 'INDEPENDENT-SEGMENTS', 'KEY: METHOD=AES-128,', 'URI of the API, IV', 'EXTINF per segment', 'ENDLIST'], tone: 'storage' });
const segs = card({ x: 760, y: 420, w: 250, h: 150, title: 'seg_00000.ts …', sub: ['MPEG-TS, about 6 s,', 'IDR frame first,', 'AES-128 encrypted;', 'chunks: c0000_000.ts'], tone: 'storage' });
p.push(master.svg, r1080.svg, r720.svg, rLow.svg, detail.svg, segs.svg);

const preview = card({ x: 70, y: 450, w: 300, h: 110, title: 'preview/', sub: ['thumbnails.vtt,', 'sprite_000.jpg …'], tone: 'plain' });
const thumb = card({ x: 70, y: 600, w: 300, h: 100, title: 'thumbnail.jpg', sub: ['default thumbnail'], tone: 'plain' });
const captions = card({ x: 450, y: 450, w: 250, h: 110, title: 'captions/', sub: ['vi.vtt, en.vtt'], tone: 'plain' });
p.push(preview.svg, thumb.svg, captions.svg);

const api = card({ x: 1110, y: 250, w: 290, h: 140, iconName: 'aws-lambda', iconSize: 28, title: 'API: /videos/:id/key', sub: ['checks the', 'playback token'], tone: 'compute' });
const keys = card({ x: 1110, y: 470, w: 290, h: 120, iconName: 'aws-s3', iconSize: 28, title: 'S3 keys', sub: ['keys/{id}/v1.json'], tone: 'secret' });
p.push(api.svg, keys.svg);

p.push(edge([[master.box.r, r1080.box.cy], [r1080.box.x, r1080.box.cy]]));
p.push(edge([[master.box.r, r720.box.cy], [r720.box.x, r720.box.cy]]));
p.push(edge([[master.box.r, rLow.box.cy], [rLow.box.x, rLow.box.cy]]));
p.push(edge([[r720.box.r, r720.box.cy], [detail.box.x, r720.box.cy]], { dashed: true }));
p.push(edge([[detail.box.cx, detail.box.b], [detail.box.cx, segs.box.y]], { label: 'EXTINF + URI', labelDx: 62, labelDy: 6 }));
p.push(edge([[detail.box.r, 300], [api.box.x, 300]], { label: 'key URI', labelAt: 0.62 }));
p.push(edge([[api.box.cx, api.box.b], [api.box.cx, keys.box.y]], { label: 'read 16 bytes', labelDx: 72, labelDy: 6 }));

p.push(text(['Side files (preview, thumbnail, captions) are not in the master playlist; the player loads',
  'them separately, so adding a caption never rewrites a published playlist.'],
  40, 770, { size: 15.5, anchor: 'start', fill: PALETTE.muted, lineHeight: 20 }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('22-hls-output', svg, 3);
console.log(`22-hls-output -> ${(out.bytes / 1024).toFixed(0)} KB`);
