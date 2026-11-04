/**
 * Builds the data files of the chapter 6 charts from the final-configuration runs of 2026-11-04
 * (docs/results/runs/2026-11-04-v2-*.json), so every bar can be traced to a measured record.
 *
 *   report/generated/chart-v2-ttff.json       playback steps: first sample and mean of the rest
 *   report/generated/chart-v2-transcode.json  median run per file size (S5-2b)
 *   report/generated/chart-v2-four-hour.json  4-hour video timeline (S5-4)
 *   report/generated/chart-v2-burst.json      100 concurrent uploads, per video (S5-3c)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUNS = path.join(ROOT, 'docs', 'results', 'runs');
const OUT = path.join(ROOT, 'report', 'generated');
const read = (name) => JSON.parse(fs.readFileSync(path.join(RUNS, name), 'utf8'));
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log('wrote', name);
};
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ── Playback steps ─────────────────────────────────────────────────────────
{
  const run = read('2026-11-04-v2-ttff.json').runs[0];
  const steps = ['grant', 'master', 'playlist', 'key', 'segment'];
  const first = Object.fromEntries(run.samples[0].steps.map((s) => [s.name, s.ms]));
  write('chart-v2-ttff.json', {
    source: '2026-11-04-v2-ttff.json',
    rendition: run.video.rendition,
    rows: [
      { label: 'First request', note: 'caches cold', total_ms: run.first_sample_ms, steps: Object.fromEntries(steps.map((s) => [s, first[s]])) },
      { label: `Next ${run.summary_ms.n}, mean`, note: `p95 ${run.summary_ms.p95} ms`, total_ms: run.summary_ms.mean, steps: Object.fromEntries(steps.map((s) => [s, run.per_step_ms[s].mean])) },
    ],
  });
}

// ── Transcode time by size ────────────────────────────────────────────────
{
  const runs = read('2026-11-04-v2-s2b-resized.json').runs;
  const labels = ['clip36', '100MB', '500MB', '1GB'];
  const rows = labels.map((label) => {
    const rs = runs.filter((r) => r.video.label === label);
    const mid = median(rs.map((r) => r.timings_s.end_to_end));
    const r = rs.find((x) => x.timings_s.end_to_end === mid);
    const t = r.timings_s;
    const intake = t.ingest + t.probe;
    return {
      label,
      duration_s: r.video.duration_s,
      size_gib: r.video.size_gib,
      path: r.path,
      chunks: r.chunk?.count ?? null,
      runs: rs.length,
      end_to_end_s: { median: t.end_to_end, min: Math.min(...rs.map((x) => x.timings_s.end_to_end)), max: Math.max(...rs.map((x) => x.timings_s.end_to_end)) },
      parts_s: { intake: round(intake), wait: t.queue_to_first_job, work: round(t.end_to_end - intake - t.queue_to_first_job) },
      vcpu_s_per_source_s: round(median(rs.map((x) => x.vcpu_seconds / x.video.duration_s)), 2),
      id: r.id,
    };
  });
  write('chart-v2-transcode.json', { source: '2026-11-04-v2-s2b-resized.json', rows });
}

// ── Four-hour video ───────────────────────────────────────────────────────
{
  const r = read('2026-11-04-v2-s4-long.json').runs[0];
  const t = r.timings_s;
  const start = t.ingest + t.probe + t.queue_to_first_job;
  const chunksStart = start + t.audio;
  const chunksEnd = chunksStart + t.chunks;
  write('chart-v2-four-hour.json', {
    source: '2026-11-04-v2-s4-long.json',
    end_to_end_s: t.end_to_end,
    upload_s: t.upload,
    chunks: r.chunk.count,
    vcpu_hours: round(r.vcpu_seconds / 3600, 1),
    bars: [
      { label: 'Intake and wait', from: 0, to: round(start) },
      { label: 'Analyse', from: round(start), to: round(start + t.analyse) },
      { label: 'Audio', from: round(start), to: round(chunksStart) },
      { label: `Chunks (${r.chunk.count})`, from: round(chunksStart), to: round(chunksEnd) },
      { label: 'Stitch, publish', from: round(chunksEnd), to: t.end_to_end },
    ],
  });
}

// ── Burst of 100 uploads ──────────────────────────────────────────────────
{
  const k = read('2026-11-04-v2-s3c-burst.json');
  const videos = k.runs
    .map((r) => ({ wait: r.timings_s.queue_to_first_job, total: r.timings_s.end_to_end }))
    .sort((a, b) => a.total - b.total);
  write('chart-v2-burst.json', {
    source: '2026-11-04-v2-s3c-burst.json',
    started: 100,
    ready: k.runs.length,
    failed: k.failures.length,
    videos,
  });
}
