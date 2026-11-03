#!/usr/bin/env node
/**
 * Load on the API Lambda behind the Cloudflare Worker (S5, measurement 6).
 *
 *   node scripts/bench/api-load.mjs --env prod --out docs/results/runs/2026-11-05-v2-api.json
 *
 * Read-only requests (home feed, a video, search). Three phases:
 *   first     one request after the API has been idle (a cold start if no instance is warm)
 *   warm      sequential requests: latency of a warm instance
 *   bursts    10, 20, 40 and 80 requests at once; the function has 20 reserved instances, so the
 *             larger bursts show what happens past the ceiling (Lambda throttling, HTTP 429/503)
 * The per-IP limit of the API is 300 requests a minute, so each burst waits a minute and the
 * whole run stays under it. Cold starts are counted afterwards from the REPORT lines of the
 * function log (Init Duration), which is the only reliable source.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ENVS, REGION, sleep, writeResults } from './lib.mjs';

const { values: o } = parseArgs({
  options: {
    env: { type: 'string', default: 'prod' },
    warm: { type: 'string', default: '40' },
    bursts: { type: 'string', default: '10,20,40,80' },
    video: { type: 'string', default: '' },
    out: { type: 'string' },
    title: { type: 'string', default: 'v2 API load' },
  },
});
if (!o.out) throw new Error('--out is required');
const env = ENVS[o.env];
const paths = ['/v1/videos?limit=12', ...(o.video ? [`/v1/videos/${o.video}`] : []), '/v1/search?q=video'];

async function hit(path) {
  const t = performance.now();
  try {
    const res = await fetch(`${env.api}${path}`, { headers: { origin: env.web } });
    await res.arrayBuffer();
    return { status: res.status, ms: Math.round((performance.now() - t) * 10) / 10 };
  } catch (err) {
    return { status: 0, ms: Math.round((performance.now() - t) * 10) / 10, error: err.message };
  }
}

const stats = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
};
const statusCounts = (rs) => rs.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});

const startedAt = Date.now();
const first = await hit(paths[0]);
console.log(`first: ${first.status} ${first.ms} ms`);

const warm = [];
for (let i = 0; i < Number(o.warm); i++) warm.push(await hit(paths[i % paths.length]));
console.log(`warm: p50 ${stats(warm.map((r) => r.ms)).p50} ms`, statusCounts(warm));

const bursts = [];
for (const n of o.bursts.split(',').map(Number)) {
  await sleep(61_000);
  const t = performance.now();
  const rs = await Promise.all(Array.from({ length: n }, (_, i) => hit(paths[i % paths.length])));
  const wall = Math.round(performance.now() - t);
  const ok = rs.filter((r) => r.status === 200);
  bursts.push({ concurrency: n, wall_ms: wall, status: statusCounts(rs), ok_latency_ms: stats(ok.map((r) => r.ms)) });
  console.log(`burst ${n}: ${wall} ms wall`, statusCounts(rs), `ok p95 ${stats(ok.map((r) => r.ms))?.p95} ms`);
}

// Cold starts from the function log: REPORT lines carry "Init Duration" only on a cold start.
await sleep(20_000);
const logs = new CloudWatchLogsClient({ region: REGION });
const reports = [];
let nextToken;
do {
  const page = await logs.send(new FilterLogEventsCommand({ logGroupName: `/aws/lambda/${env.name}-api`, startTime: startedAt - 5000, filterPattern: 'REPORT', nextToken }));
  reports.push(...page.events.map((e) => e.message));
  nextToken = page.nextToken;
} while (nextToken);
const inits = reports.map((m) => /Init Duration: ([\d.]+) ms/.exec(m)?.[1]).filter(Boolean).map(Number);
const durations = reports.map((m) => /\tDuration: ([\d.]+) ms/.exec(m)?.[1]).filter(Boolean).map(Number);

const date = new Date().toISOString().slice(0, 10);
const record = {
  id: `${date}-${o.env}-v2-api-load`,
  date,
  environment: o.env,
  stack: 'v2',
  path: 'api-load',
  function: { name: `${env.name}-api`, memory_mb: 512, reserved_concurrency: 20 },
  first_request: first,
  warm: { status: statusCounts(warm), latency_ms: stats(warm.map((r) => r.ms)) },
  bursts,
  lambda: { invocations: reports.length, cold_starts: inits.length, init_ms: stats(inits), handler_ms: stats(durations) },
  provenance: 'measured',
  source: 'scripts/bench/api-load.mjs',
  notes: 'Client in Vietnam through the Cloudflare Worker; latency includes the Worker and the network.',
};
const out = resolve(o.out);
const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).runs : [];
writeResults(out, o.title, [...prior, record]);
console.log(`cold starts ${inits.length}/${reports.length}, init p50 ${record.lambda.init_ms?.p50} ms -> ${out}`);
