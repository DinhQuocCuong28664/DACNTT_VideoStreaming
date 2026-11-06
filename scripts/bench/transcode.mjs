#!/usr/bin/env node
/**
 * Transcode timing of the v2 pipeline (S5, measurements 2-4).
 *
 *   node scripts/bench/transcode.mjs --env prod --file samples/video-100mb.mp4 --label 100MB \
 *     --runs 3 --out docs/results/runs/2026-11-05-v2-size.json --title "..."
 *   ... --concurrency 50 --runs 1      a burst: 50 uploads at once, one record per upload
 *
 * Each upload goes through the public API as the E2E creator (unlisted), so the measurement
 * covers what a user waits for: S3 event, SQS, Step Functions, Fargate start-up, FFmpeg and
 * publishing. The stages come from the execution history and the Batch job timestamps, not from
 * polling. The video is deleted afterwards unless --keep is given. Runs are sequential; a burst
 * runs its uploads in parallel.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ENVS, benchAccounts, client, executionArn, seconds, signUrl, timeline, today, upload, waitForExecution, writeResults } from './lib.mjs';

const { values: o } = parseArgs({
  options: {
    env: { type: 'string', default: 'staging' },
    file: { type: 'string' },
    label: { type: 'string' },
    runs: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '1' },
    out: { type: 'string' },
    title: { type: 'string', default: 'v2 transcode timing' },
    keep: { type: 'boolean', default: false },
    notes: { type: 'string', default: '' },
  },
});
if (!o.file || !o.label || !o.out) throw new Error('--file, --label and --out are required');
const file = resolve(o.file);
const runs = Number(o.runs);
const concurrency = Number(o.concurrency);
const env = ENVS[o.env];
// An account may start 20 uploads an hour; a burst spreads its uploads over the bench accounts.
const PER_ACCOUNT = 20;
const pool = concurrency > 1 ? benchAccounts(o.env) : [];
if (concurrency * runs > PER_ACCOUNT * Math.max(1, pool.length)) {
  throw new Error(`${concurrency * runs} uploads need ${Math.ceil((concurrency * runs) / PER_ACCOUNT)} accounts; run node scripts/seed.mjs bench --env ${o.env}`);
}
const apis = [];
for (const account of pool.length ? pool : [undefined]) {
  const c = client(o.env);
  await c.signIn(account);
  apis.push(c);
}

/** Duration, size and frame rate of the input, from ffprobe on this machine. */
function describe(path) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate:format=duration', '-of', 'json', path], { encoding: 'utf8' });
  if (r.status !== 0) return { duration_s: null, resolution: null, fps: null };
  const j = JSON.parse(r.stdout);
  const v = j.streams?.[0] ?? {};
  const [n, d] = String(v.avg_frame_rate ?? '0/1').split('/').map(Number);
  return { duration_s: Math.round(Number(j.format?.duration ?? 0) * 10) / 10, resolution: v.width ? `${v.width}x${v.height}` : null, fps: d ? Math.round((n / d) * 100) / 100 : null };
}
const input = describe(file);

const span = (s) => (s?.entered && s?.exited ? seconds(s.entered, s.exited) : null);
const date = today();

/** One upload measured end to end, as a record of docs/results/runs (schema 1). */
async function measure(runIndex, position) {
  const api = apis[(position - 1) % apis.length];
  const retriesBefore = api.stats.retries;
  const title = `bench ${o.label} r${runIndex}${concurrency > 1 ? ` #${position}` : ''}`;
  const up = await upload(api, file, { title });
  const arn = executionArn(o.env, up.id, up.uploadVersion);
  const exec = await waitForExecution(arn);
  if (!exec) throw new Error(`no execution for ${up.id}`);
  const { states, jobs } = await timeline(arn);

  const probe = states['Probe']?.output?.probe ?? {};
  const t0 = up.uploadedAt;
  const done = exec.stopDate.getTime();
  const started = jobs.filter((j) => j.started).map((j) => j.started);
  const run = (role) => jobs.filter((j) => j.role === role && j.started && j.stopped);
  const phase = (role) => {
    const js = run(role);
    return js.length ? seconds(Math.min(...js.map((j) => j.started)), Math.max(...js.map((j) => j.stopped))) : null;
  };
  const chunks = run('chunk');

  // Playable: the owner's playback grant and a master playlist with variants.
  let variants = 0;
  if (exec.status === 'SUCCEEDED') {
    const grant = await api.call(`/videos/${up.id}/playback`);
    const master = await fetch(signUrl(grant.masterUrl, grant.cdnQuery), { headers: { origin: env.web } });
    if (master.ok) variants = ((await master.text()).match(/#EXT-X-STREAM-INF/g) ?? []).length;
  }
  if (!o.keep) await api.call(`/videos/${up.id}`, { method: 'DELETE' }).catch((err) => console.error(`delete ${up.id}: ${err.message}`));

  const record = {
    id: `${date}-${o.env}-v2-${o.label}-r${runIndex}${concurrency > 1 ? `-c${concurrency}-${position}` : ''}`,
    date,
    account: 'B',
    region: 'ap-southeast-1',
    environment: o.env,
    stack: 'v2',
    path: probe.mode ?? (chunks.length ? 'chunked' : 'single'),
    capacity: env.capacity,
    chunk: chunks.length ? { count: chunks.length, vcpu: chunks[0].vcpu } : null,
    video: { label: o.label, file: basename(file), size_gib: Math.round((up.size / 1024 ** 3) * 1000) / 1000, ...input },
    concurrency,
    queue_position: concurrency > 1 ? position : 1,
    measured_from: 'upload_complete',
    timings_s: {
      upload: up.uploadSeconds,
      ingest: seconds(t0, exec.startDate.getTime()),
      probe: span(states['Probe']),
      queue_to_first_job: started.length ? seconds(t0, Math.min(...started)) : null,
      startup_max: jobs.length ? Math.max(...jobs.filter((j) => j.started).map((j) => seconds(j.created, j.started))) : null,
      analyse: phase('analyse'),
      encode: phase('encode'),
      audio: phase('audio'),
      chunks: phase('chunk'),
      stitch: span(states['Stitch']),
      publish: span(states['Publish']),
      end_to_end: seconds(t0, done),
      end_to_end_with_upload: seconds(t0, done) + up.uploadSeconds,
    },
    vcpu_seconds: Math.round(jobs.filter((j) => j.started && j.stopped).reduce((s, j) => s + ((j.stopped - j.started) / 1000) * j.vcpu, 0)),
    vcpu_seconds_scope: 'all_jobs',
    capacity_used: { spot: jobs.filter((j) => j.capacity === 'spot').length, ondemand: jobs.filter((j) => j.capacity === 'ondemand').length },
    result: { final_status: exec.status === 'SUCCEEDED' ? 'READY' : exec.status, hls_verified: variants > 0, variants },
    api_retries: api.stats.retries - retriesBefore,
    provenance: 'measured',
    source: 'scripts/bench/transcode.mjs',
    notes: o.notes,
  };
  console.log(`${record.id}: ${record.result.final_status} ${record.path} e2e ${record.timings_s.end_to_end}s, first job ${record.timings_s.queue_to_first_job}s, ${record.vcpu_seconds} vCPU-s, spot/od ${record.capacity_used.spot}/${record.capacity_used.ondemand}`);
  return record;
}

const out = resolve(o.out);
const prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { runs: [], failures: [] };
const records = prior.runs;
const failures = prior.failures ?? [];
for (let r = 1; r <= runs; r++) {
  const batch = await Promise.all(Array.from({ length: concurrency }, (_, i) => measure(r, i + 1).catch((err) => {
    console.error(`run ${r} #${i + 1} failed: ${err.message}`);
    failures.push({ date: today(), label: o.label, run: r, position: i + 1, concurrency, error: err.message });
    return null;
  })));
  records.push(...batch.filter(Boolean));
  writeResults(out, o.title, records, failures);
}
console.log(`wrote ${records.length} records and ${failures.length} failures to ${out}`);
