/**
 * Shared helpers of the v2 measurement tools: environments, the E2E creator session, uploads
 * through the public API, and the timeline of one workflow execution (Step Functions + Batch).
 */
import { existsSync, openAsBlob, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from 'node:fs/promises';
import { BatchClient, DescribeJobsCommand, ListJobsCommand } from '@aws-sdk/client-batch';
import { DescribeExecutionCommand, GetExecutionHistoryCommand, SFNClient } from '@aws-sdk/client-sfn';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REGION = 'ap-southeast-1';
export const ACCOUNT_ID = '749680934725';

export const ENVS = {
  staging: { api: 'https://api-v2-staging.zelostech.site', web: 'https://v2-staging.zelostech.site', name: 'zelos-staging', capacity: { spot_max_vcpus: 8, ondemand_max_vcpus: 8 } },
  prod: { api: 'https://api.zelostech.site', web: 'https://zelostech.site', name: 'zelos-prod', capacity: { spot_max_vcpus: 24, ondemand_max_vcpus: 24 } },
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Adds the signed policy of a playback grant to a CDN URL, as web/src/lib/playback.ts does. */
export function signUrl(url, query) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
  return u.toString();
}
export const seconds = (a, b) => Math.round(((b - a) / 1000) * 10) / 10;

export function client(envName) {
  const env = ENVS[envName];
  if (!env) throw new Error(`unknown environment ${envName}`);
  let token = null;

  async function call(path, { body, method = body === undefined ? 'GET' : 'POST', auth = true } = {}) {
    const res = await fetch(`${env.api}/v1${path}`, {
      method,
      headers: { origin: env.web, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(auth && token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data?.error?.code ?? ''}`.trim());
    return data;
  }

  return {
    env,
    call,
    /** Signs in as `account`, or as the E2E creator (scripts/seed.mjs e2e); passwords stay in files. */
    async signIn(account) {
      let a = account;
      if (!a) {
        const file = join(ROOT, '.local-notes', `${envName}-e2e-accounts.json`);
        if (!existsSync(file)) throw new Error(`no ${file}; run node scripts/seed.mjs e2e --env ${envName}`);
        a = JSON.parse(readFileSync(file, 'utf8')).creator;
      }
      ({ token } = await call('/auth/login', { body: { email: a.email, password: a.password }, auth: false }));
    },
  };
}

/** Uploads a file the way the web app does; returns the video id and when storage had it all. */
export async function upload(api, path, { title, visibility = 'unlisted', partConcurrency = 4 }) {
  const size = statSync(path).size;
  const created = await api.call('/uploads', { body: { fileName: basename(path), size, contentType: 'video/mp4', title, visibility } });
  const { video, upload: grant } = created;
  const started = Date.now();
  if (grant.mode === 'post') {
    const form = new FormData();
    for (const [k, v] of Object.entries(grant.fields)) form.append(k, v);
    form.append('file', await openAsBlob(path, { type: 'video/mp4' }), basename(path));
    const res = await fetch(grant.url, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`storage answered ${res.status}`);
  } else {
    const numbers = Array.from({ length: grant.partCount }, (_, i) => i + 1);
    const fh = await open(path, 'r');
    try {
      for (let i = 0; i < numbers.length; i += 100) {
        const { parts } = await api.call(`/uploads/${video.id}/parts`, { body: { partNumbers: numbers.slice(i, i + 100) } });
        let next = 0;
        await Promise.all(Array.from({ length: partConcurrency }, async () => {
          while (next < parts.length) {
            const p = parts[next++];
            const buf = Buffer.alloc(p.size);
            await fh.read(buf, 0, p.size, (p.partNumber - 1) * grant.partSize);
            const res = await fetch(p.url, { method: 'PUT', body: buf });
            if (!res.ok) throw new Error(`part ${p.partNumber}: ${res.status}`);
          }
        }));
      }
    } finally {
      await fh.close();
    }
  }
  await api.call(`/uploads/${video.id}/complete`, { body: {} });
  return { id: video.id, uploadVersion: video.uploadVersion, size, uploadSeconds: seconds(started, Date.now()), uploadedAt: Date.now() };
}

const sfn = new SFNClient({ region: REGION });
const batch = new BatchClient({ region: REGION });

export const stateMachineArn = (envName) => `arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:${ENVS[envName].name}-transcode`;
export const executionArn = (envName, id, version) => `arn:aws:states:${REGION}:${ACCOUNT_ID}:execution:${ENVS[envName].name}-transcode:${id}-${version}`;

/** Waits until the execution of a video ends; null if it never starts within `startTimeoutMs`. */
export async function waitForExecution(arn, { startTimeoutMs = 300_000, endTimeoutMs = 6 * 3600_000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    try {
      const d = await sfn.send(new DescribeExecutionCommand({ executionArn: arn }));
      if (d.status !== 'RUNNING') return d;
      if (Date.now() - t0 > endTimeoutMs) throw new Error(`${arn} still running`);
    } catch (err) {
      if (err.name !== 'ExecutionDoesNotExist') throw err;
      if (Date.now() - t0 > startTimeoutMs) return null;
    }
    await sleep(10_000);
  }
}

const capacityOf = (taskArn) => (taskArn?.includes('-spot-') ? 'spot' : taskArn?.includes('-ondemand-') ? 'ondemand' : 'unknown');
const vcpuOf = (job) => Number(job.container?.resourceRequirements?.find((r) => r.type === 'VCPU')?.value ?? 0);

async function describeAll(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...(await batch.send(new DescribeJobsCommand({ jobs: ids.slice(i, i + 100) }))).jobs);
  return out;
}

/** Child jobs of an array job; their timestamps are what the chunk phase is made of. */
async function arrayChildren(arrayJobId) {
  const ids = [];
  for (const status of ['SUCCEEDED', 'FAILED']) {
    let nextToken;
    do {
      const page = await batch.send(new ListJobsCommand({ arrayJobId, jobStatus: status, nextToken }));
      ids.push(...page.jobSummaryList.map((j) => j.jobId));
      nextToken = page.nextToken;
    } while (nextToken);
  }
  return describeAll(ids);
}

/**
 * The timeline of one execution: each state's entry and exit, and for Batch states the jobs with
 * created/started/stopped times, vCPU and capacity (Spot or On-Demand, from the ECS cluster).
 */
export async function timeline(arn) {
  const events = [];
  let nextToken;
  do {
    const page = await sfn.send(new GetExecutionHistoryCommand({ executionArn: arn, maxResults: 1000, nextToken }));
    events.push(...page.events);
    nextToken = page.nextToken;
  } while (nextToken);

  const states = {};
  for (const e of events) {
    const entered = e.stateEnteredEventDetails;
    const exited = e.stateExitedEventDetails;
    if (entered) (states[entered.name] ??= {}).entered = e.timestamp.getTime();
    if (exited) {
      const s = (states[exited.name] ??= {});
      s.exited = e.timestamp.getTime();
      try { s.output = JSON.parse(exited.output ?? 'null'); } catch { s.output = null; }
    }
  }

  const jobIds = [];
  for (const e of events) {
    if (e.type !== 'TaskSucceeded' && e.type !== 'TaskFailed') continue;
    const out = e.taskSucceededEventDetails?.output ?? e.taskFailedEventDetails?.cause;
    try { const j = JSON.parse(out ?? '{}'); if (j.JobId) jobIds.push(j.JobId); } catch { /* not a Batch task */ }
  }
  const jobs = [];
  for (const j of await describeAll(jobIds)) {
    const role = j.jobName.split('-')[0];
    if (j.arrayProperties?.size) {
      for (const c of await arrayChildren(j.jobId)) {
        jobs.push({ role, index: c.arrayProperties?.index ?? null, created: c.createdAt, started: c.startedAt, stopped: c.stoppedAt, vcpu: vcpuOf(c) || vcpuOf(j), capacity: capacityOf(c.container?.taskArn), status: c.status });
      }
    } else {
      jobs.push({ role, index: null, created: j.createdAt, started: j.startedAt, stopped: j.stoppedAt, vcpu: vcpuOf(j), capacity: capacityOf(j.container?.taskArn), status: j.status });
    }
  }
  return { states, jobs };
}

/** The bench accounts of scripts/seed.mjs bench, for bursts larger than one account's limit. */
export function benchAccounts(envName) {
  const file = join(ROOT, '.local-notes', `${envName}-bench-accounts.json`);
  return existsSync(file) ? Object.values(JSON.parse(readFileSync(file, 'utf8'))) : [];
}

export function writeResults(file, title, runs) {
  writeFileSync(file, `${JSON.stringify({ schema: 1, title, runs }, null, 2)}\n`);
}
