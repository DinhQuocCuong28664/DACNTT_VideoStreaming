#!/usr/bin/env node
/**
 * Fault handling of the v2 pipeline (NFR-08): uploads a file that cannot be transcoded and
 * records what the workflow did with it.
 *
 *   node scripts/bench/fault.mjs --env prod --file <bad file> --label garbage \
 *     --out docs/results/runs/2026-11-11-v2-fault.json [--append]
 *
 * The upload goes through the public API as the E2E creator (unlisted), like transcode.mjs. The
 * script then reads the execution history and the Batch jobs, and keeps for each state whether it
 * failed and how many times it ran, so the record shows where the failure was caught, whether it
 * was retried and how long it took to reach ERROR. The video is deleted afterwards unless --keep
 * is given. Screening is not involved: a file that fails before analysis never reaches Rekognition.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { GetExecutionHistoryCommand, SFNClient } from '@aws-sdk/client-sfn';
import { ENVS, REGION, client, executionArn, seconds, today, upload, waitForExecution, writeResults } from './lib.mjs';

const { values: o } = parseArgs({
  options: {
    env: { type: 'string', default: 'staging' },
    file: { type: 'string' },
    label: { type: 'string' },
    description: { type: 'string', default: '' },
    out: { type: 'string' },
    append: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
});
if (!o.file || !o.label || !o.out) throw new Error('--file, --label and --out are required');
const file = resolve(o.file);
const env = ENVS[o.env];
if (!env) throw new Error(`unknown environment ${o.env}`);

const sfn = new SFNClient({ region: REGION });

/** Removes the query string of presigned URLs (signature and session token) from a message. */
const redact = (text) => (text == null ? text : String(text).replace(/(https:\/\/[^\s?"\\]+)\?[^\s"\\]*/g, '$1?<presigned query removed>'));

/** Every event of an execution, in order. */
async function history(arn) {
  const events = [];
  let nextToken;
  do {
    const page = await sfn.send(new GetExecutionHistoryCommand({ executionArn: arn, maxResults: 1000, nextToken }));
    events.push(...page.events);
    nextToken = page.nextToken;
  } while (nextToken);
  return events;
}

/**
 * Per state: when it was entered and left, how many task attempts it made, how many failed, and
 * for a Batch state the attempts and exit codes that Batch reported. Step Functions retries show
 * as several TaskScheduled events inside one state; Batch retries show as several job attempts.
 */
function summariseStates(events) {
  const states = [];
  let current = null;
  for (const e of events) {
    const entered = e.stateEnteredEventDetails;
    const exited = e.stateExitedEventDetails;
    if (entered) {
      current = { name: entered.name, entered: e.timestamp.getTime(), exited: null, taskAttempts: 0, taskFailures: 0, error: null, batch: null };
      states.push(current);
    } else if (exited) {
      const s = [...states].reverse().find((x) => x.name === exited.name && x.exited === null);
      if (s) s.exited = e.timestamp.getTime();
    } else if (current && e.type === 'TaskScheduled') {
      current.taskAttempts += 1;
    } else if (current && e.type === 'TaskFailed') {
      current.taskFailures += 1;
      const d = e.taskFailedEventDetails;
      current.error = redact(`${d.error ?? ''}: ${(d.cause ?? '').slice(0, 300)}`);
      if (d.resourceType === 'batch') {
        try {
          const job = JSON.parse(d.cause ?? '{}');
          current.batch = {
            attempts: (job.Attempts ?? []).length,
            exitCodes: (job.Attempts ?? []).map((a) => a.Container?.ExitCode ?? null),
            statusReason: job.StatusReason ?? null,
          };
        } catch { /* the cause is not a job description */ }
      }
    }
  }
  return states;
}

const size = statSync(file).size;
const api = client(o.env);
await api.signIn();

const started = Date.now();
const up = await upload(api, file, { title: `fault ${o.label} ${today()}`, visibility: 'unlisted' });
const arn = executionArn(o.env, up.id, up.uploadVersion);
const exec = await waitForExecution(arn, { startTimeoutMs: 300_000, endTimeoutMs: 3600_000 });
if (!exec) throw new Error(`no execution ${arn} within five minutes`);

const events = await history(arn);
const states = summariseStates(events);
const { video } = await api.call(`/videos/${up.id}`);

const executionStart = exec.startDate.getTime();
const markFailed = states.find((s) => s.name === 'MarkFailed');
const failedAt = states.find((s) => s.taskFailures > 0);

const run = {
  id: `${today()}-${o.env}-v2-fault-${o.label}`,
  date: today(),
  account: 'B',
  region: REGION,
  environment: o.env,
  stack: 'v2',
  path: 'fault',
  input: { label: o.label, file: basename(file), size_bytes: size, description: o.description || null },
  measured_from: 'upload_complete',
  timings_s: {
    upload: up.uploadSeconds,
    ingest: seconds(up.uploadedAt, executionStart),
    to_mark_failed: markFailed ? seconds(up.uploadedAt, markFailed.exited ?? markFailed.entered) : null,
    end_to_end: seconds(up.uploadedAt, exec.stopDate.getTime()),
  },
  execution: {
    status: exec.status,
    failed_state: failedAt?.name ?? null,
    error: failedAt?.error ?? null,
    states: states.map((s) => ({
      name: s.name,
      seconds: s.exited ? seconds(s.entered, s.exited) : null,
      task_attempts: s.taskAttempts,
      task_failures: s.taskFailures,
      ...(s.batch ? { batch_attempts: s.batch.attempts, exit_codes: s.batch.exitCodes, status_reason: s.batch.statusReason } : {}),
    })),
  },
  result: { final_status: video?.status ?? null, error: redact(video?.error ?? null) },
  api_retries: api.stats.retries,
  provenance: 'measured',
  source: 'scripts/bench/fault.mjs',
};

if (!o.keep) await api.call(`/videos/${up.id}`, { method: 'DELETE' });

const out = resolve(o.out);
const previous = o.append && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).runs : [];
writeResults(out, 'v2 fault handling: files that cannot be transcoded (NFR-08)', [...previous, run]);
console.log(JSON.stringify(run, null, 2));
console.log(`total ${seconds(started, Date.now())} s -> ${out}`);
