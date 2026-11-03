#!/usr/bin/env node
/**
 * Time to first frame of the v2 playback path, without a browser (S5, measurement 1).
 *
 *   node scripts/bench/ttff.mjs --env prod --video <id> --iterations 20 --rendition 720p \
 *     --out docs/results/runs/2026-11-05-v2-ttff.json --label local-vn
 *
 * One sample is what a player does before it can show a frame: the playback grant from the API,
 * the master playlist, one rendition playlist, the AES key (with the playback token) and the first
 * segment, all through CloudFront with the signed policy. Each step is timed, with the CloudFront
 * cache result. The first sample after a deploy or a long pause is usually a cache miss; the
 * summary keeps first and later samples apart. Browser-side throttling is measured by
 * scripts/qoe/collect.js, which plays the real page.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ENVS, signUrl as signed, today, writeResults } from './lib.mjs';

const { values: o } = parseArgs({
  options: {
    env: { type: 'string', default: 'prod' },
    video: { type: 'string' },
    iterations: { type: 'string', default: '20' },
    rendition: { type: 'string', default: '720p' },
    pause: { type: 'string', default: '1000' },
    label: { type: 'string', default: 'local' },
    out: { type: 'string' },
    title: { type: 'string', default: 'v2 time to first frame' },
  },
});
if (!o.video || !o.out) throw new Error('--video and --out are required');
const env = ENVS[o.env];
const headers = { origin: env.web };

async function step(name, fn) {
  const t = performance.now();
  const res = await fn();
  const body = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return { name, ms: Math.round((performance.now() - t) * 10) / 10, bytes: body.length, cache: res.headers.get('x-cache') ?? null, pop: res.headers.get('x-amz-cf-pop') ?? null, body };
}

async function sample() {
  const t = performance.now();
  const grant = await step('grant', () => fetch(`${env.api}/v1/videos/${o.video}/playback`, { headers }));
  const g = JSON.parse(grant.body.toString());
  const master = await step('master', () => fetch(signed(g.masterUrl, g.cdnQuery), { headers }));
  const lines = master.body.toString().split('\n');
  const variant = lines.find((l) => l.trim() && !l.startsWith('#') && l.includes(`${o.rendition}/`)) ?? lines.find((l) => l.trim() && !l.startsWith('#'));
  const playlistUrl = new URL(variant.trim(), g.masterUrl).href;
  const playlist = await step('playlist', () => fetch(signed(playlistUrl, g.cdnQuery), { headers }));
  const text = playlist.body.toString();
  const keyUri = /#EXT-X-KEY:[^\n]*URI="([^"]+)"/.exec(text)?.[1];
  const key = keyUri ? await step('key', () => fetch(keyUri, { headers: { ...headers, 'x-playback-token': g.playbackToken } })) : null;
  if (key && key.bytes !== 16) throw new Error(`key is ${key.bytes} bytes`);
  const first = text.split('\n').find((l) => l.trim() && !l.startsWith('#'));
  const segment = await step('segment', () => fetch(signed(new URL(first.trim(), playlistUrl).href, g.cdnQuery), { headers }));
  const total = Math.round((performance.now() - t) * 10) / 10;
  return { total_ms: total, rendition: variant.split('/')[0], steps: [grant, master, playlist, key, segment].filter(Boolean).map(({ body: _b, ...s }) => s) };
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10, p50: q(0.5), p95: q(0.95), min: s[0], max: s[s.length - 1] };
};

const samples = [];
for (let i = 0; i < Number(o.iterations); i++) {
  try {
    const s = await sample();
    samples.push(s);
    console.log(`#${i + 1} ${s.total_ms} ms  ${s.steps.map((x) => `${x.name} ${x.ms}${x.cache?.startsWith('Hit') ? 'H' : x.cache ? 'M' : ''}`).join(' | ')}`);
  } catch (err) {
    console.error(`#${i + 1} failed: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, Number(o.pause)));
}

const date = today();
const record = {
  id: `${date}-${o.env}-v2-ttff-${o.label}`,
  date,
  environment: o.env,
  stack: 'v2',
  path: 'ttff',
  vantage: o.label,
  video: { id: o.video, rendition: o.rendition },
  first_sample_ms: samples[0]?.total_ms ?? null,
  summary_ms: samples.length > 1 ? stats(samples.slice(1).map((s) => s.total_ms)) : null,
  per_step_ms: Object.fromEntries(['grant', 'master', 'playlist', 'key', 'segment'].map((n) => [n, stats(samples.slice(1).flatMap((s) => s.steps.filter((x) => x.name === n).map((x) => x.ms)))])),
  samples,
  provenance: 'measured',
  source: 'scripts/bench/ttff.mjs',
};
const out = resolve(o.out);
const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).runs : [];
writeResults(out, o.title, [...prior, record]);
console.log(`first ${record.first_sample_ms} ms, later p50 ${record.summary_ms?.p50} ms p95 ${record.summary_ms?.p95} ms -> ${out}`);
