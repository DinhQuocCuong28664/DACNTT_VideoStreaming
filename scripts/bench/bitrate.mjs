#!/usr/bin/env node
/**
 * Declared against delivered bitrate, per rendition (S5, measurement 5).
 *
 *   node scripts/bench/bitrate.mjs --env prod --videos <id>,<id> --out docs/results/runs/2026-11-05-v2-bitrate.json
 *
 * Read-only on the processed bucket: the master playlist gives BANDWIDTH (peak) and
 * AVERAGE-BANDWIDTH per variant; each rendition playlist gives the segment durations and the
 * object listing their sizes. Segments are AES-128 encrypted, so their size is the encoded size
 * plus at most 16 bytes of padding, which is negligible. Per rendition the record keeps the
 * average and the peak segment bitrate next to what the playlist declares, and the segment
 * duration spread (target 6 s).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { ACCOUNT_ID, ENVS, REGION, today, writeResults } from './lib.mjs';

const { values: o } = parseArgs({
  options: {
    env: { type: 'string', default: 'prod' },
    videos: { type: 'string' },
    version: { type: 'string', default: '1' },
    out: { type: 'string' },
    title: { type: 'string', default: 'v2 declared vs delivered bitrate' },
  },
});
if (!o.videos || !o.out) throw new Error('--videos and --out are required');
const s3 = new S3Client({ region: REGION });
const bucket = `${ENVS[o.env].name}-processed-${ACCOUNT_ID}`;

const text = async (Key) => (await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key }))).Body.transformToString());
async function sizes(Prefix) {
  const out = new Map();
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }));
    for (const obj of page.Contents ?? []) out.set(obj.Key.slice(Prefix.length), obj.Size);
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return out;
}

const kbps = (bytes, sec) => Math.round((bytes * 8) / sec / 1000);
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

async function video(id) {
  const base = `videos/${id}/v${o.version}/`;
  const master = await text(`${base}master.m3u8`);
  const lines = master.split('\n');
  const renditions = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const attr = (name) => new RegExp(`${name}=([^,]+)`).exec(lines[i])?.[1];
    const uri = lines[i + 1].trim();
    const dir = uri.split('/')[0];
    const playlist = await text(`${base}${uri}`);
    const segs = [];
    const pl = playlist.split('\n');
    for (let j = 0; j < pl.length; j++) {
      const m = /^#EXTINF:([\d.]+)/.exec(pl[j]);
      if (m) segs.push({ duration: Number(m[1]), file: pl[j + 1].trim() });
    }
    const size = await sizes(`${base}${dir}/`);
    const withSize = segs.map((s) => ({ ...s, bytes: size.get(s.file) ?? 0 }));
    const totalSec = withSize.reduce((a, s) => a + s.duration, 0);
    const totalBytes = withSize.reduce((a, s) => a + s.bytes, 0);
    // RFC 8216 4.3.4.2: BANDWIDTH is the peak over every segment, the short last one included.
    // The peak without it is kept too, since a short tail segment is often the outlier.
    const rates = withSize.map((s) => kbps(s.bytes, s.duration));
    const peak = Math.max(...rates, 0);
    const peakBody = Math.max(...rates.slice(0, -1), 0);
    const durs = withSize.slice(0, -1).map((s) => s.duration);
    const declared = Number(attr('BANDWIDTH')) / 1000;
    const declaredAvg = attr('AVERAGE-BANDWIDTH') ? Number(attr('AVERAGE-BANDWIDTH')) / 1000 : null;
    renditions.push({
      rendition: dir,
      resolution: attr('RESOLUTION') ?? null,
      declared_kbps: declared,
      declared_average_kbps: declaredAvg,
      delivered_average_kbps: kbps(totalBytes, totalSec),
      delivered_peak_kbps: peak,
      delivered_peak_without_last_kbps: peakBody,
      last_segment: { seconds: withSize.at(-1)?.duration ?? null, kbps: rates.at(-1) ?? null },
      peak_over_declared: round(peak / declared),
      average_over_declared: round(kbps(totalBytes, totalSec) / (declaredAvg ?? declared)),
      segments: withSize.length,
      segment_seconds: durs.length ? { min: Math.min(...durs), max: Math.max(...durs), mean: round(durs.reduce((a, b) => a + b, 0) / durs.length) } : null,
      segment_kib: { mean: Math.round(totalBytes / withSize.length / 1024), max: Math.round(Math.max(...withSize.map((s) => s.bytes)) / 1024) },
    });
    console.log(`${id} ${dir}: declared ${declared}${declaredAvg ? `/${declaredAvg}` : ''} kbps, delivered avg ${kbps(totalBytes, totalSec)} peak ${peak} (without last ${peakBody}) kbps, ${withSize.length} segments`);
  }
  return renditions;
}

const date = today();
const runs = [];
for (const id of o.videos.split(',')) {
  runs.push({ id: `${date}-${o.env}-v2-bitrate-${id}`, date, environment: o.env, stack: 'v2', path: 'bitrate', video: { id }, renditions: await video(id), provenance: 'measured', source: 'scripts/bench/bitrate.mjs' });
}
const out = resolve(o.out);
const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).runs : [];
writeResults(out, o.title, [...prior, ...runs]);
console.log(`-> ${out}`);
