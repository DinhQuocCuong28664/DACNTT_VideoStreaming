import { describe, expect, it } from 'vitest';
import { billedSeconds, handleCaptions, jobName, parseJobName, type CaptionsDeps, type CaptionVideo, type JobInfo } from '../src/captions.js';

const videoId = '6a78c10f1c4541ef615cf01d';
const ownerId = '6a78c10f1c4541ef615cf01e';
const NOW = new Date('2026-11-14T10:00:00Z');
const PREFIX = 'zelos-staging';
const published = { source: 'zelos.transcoder', 'detail-type': 'VideoPublished', detail: { videoId, ownerId, publishedAt: NOW.toISOString() } };
const transcribe = (status: string) => ({ source: 'aws.transcribe', 'detail-type': 'Transcribe Job State Change', detail: { TranscriptionJobName: jobName(PREFIX, videoId, 1), TranscriptionJobStatus: status } });
const PLUS = { createdAt: new Date('2026-11-20T00:00:00Z'), billing: { plan: 'plus' as const, status: 'active', currentPeriodEnd: new Date('2026-12-14T00:00:00Z'), cancelAtPeriodEnd: false, customerId: 'c', subscriptionId: 's', eventAt: 1 } };

function world(opts: { video?: Partial<CaptionVideo>; hasAudio?: boolean; user?: unknown; used?: number; size?: number | null; job?: JobInfo | null; vtt?: string } = {}) {
  const used = new Map<string, number>();
  if (opts.used) used.set(`${ownerId}:2026-11`, opts.used);
  const started: { name: string; mediaUri: string; outputKey: string }[] = [];
  const written = new Map<string, string>();
  const added: { lang: string; label: string; path: string }[] = [];
  let job: JobInfo | null = opts.job ?? null;
  const deps: CaptionsDeps = {
    jobPrefix: PREFIX,
    buckets: { raw: 'raw-b', work: 'work-b', processed: 'proc-b' },
    video: async () => ({ owner: ownerId, uploadVersion: 1, durationSec: 60, captions: [], ...opts.video }),
    hasAudio: async () => opts.hasAudio ?? true,
    user: async () => (opts.user === undefined ? PLUS : (opts.user as never)),
    sourceSize: async () => (opts.size === undefined ? 50_000_000 : opts.size),
    reserve: async (o, m, seconds, limit) => {
      const key = `${o}:${m}`;
      const now = used.get(key) ?? 0;
      if (now + seconds > limit) return false;
      used.set(key, now + seconds);
      return true;
    },
    release: async (o, m, seconds) => { used.set(`${o}:${m}`, (used.get(`${o}:${m}`) ?? 0) - seconds); },
    job: async () => job,
    startJob: async (input) => { started.push(input); job = { status: 'IN_PROGRESS', languageCode: null, failureReason: null }; },
    readText: async () => opts.vtt ?? 'WEBVTT\n\n00:00.000 --> 00:02.000\nxin chao\n',
    putCaption: async (bucket, key, vtt) => { written.set(`${bucket}/${key}`, vtt); },
    addCaption: async (_v, _u, c) => { added.push(c); return true; },
    now: () => NOW,
    log: () => undefined,
  };
  return { deps, used, started, written, added, setJob: (j: JobInfo) => { job = j; } };
}

describe('automatic captions: start', () => {
  it('starts a job on the raw upload and reserves the billed seconds', async () => {
    const w = world();
    expect(await handleCaptions(published, w.deps)).toEqual({ action: 'started', seconds: 60 });
    expect(w.started).toEqual([{ name: `${PREFIX}-${videoId}-1`, mediaUri: `s3://raw-b/raw/${videoId}/1/source`, outputBucket: 'work-b', outputKey: `work/${videoId}/v1/captions/` }]);
    expect(w.used.get(`${ownerId}:2026-11`)).toBe(60);
  });

  it('does nothing twice for the same upload version', async () => {
    const w = world();
    await handleCaptions(published, w.deps);
    expect(await handleCaptions(published, w.deps)).toEqual({ action: 'skipped', reason: 'job already exists' });
    expect(w.started).toHaveLength(1);
    expect(w.used.get(`${ownerId}:2026-11`)).toBe(60);
  });

  it('charges the 15-second minimum for a very short clip', () => {
    expect(billedSeconds(3)).toBe(15);
    expect(billedSeconds(59.2)).toBe(60);
  });

  it('skips a free account, a video without audio, a video that is too long and an owner caption', async () => {
    const free = { createdAt: new Date('2026-11-20T00:00:00Z') };
    expect(await handleCaptions(published, world({ user: free }).deps)).toMatchObject({ reason: 'plan has no automatic captions' });
    expect(await handleCaptions(published, world({ hasAudio: false }).deps)).toMatchObject({ reason: 'no audio track' });
    expect(await handleCaptions(published, world({ video: { durationSec: 16 * 60 } }).deps)).toMatchObject({ reason: 'video longer than the plan allows' });
    expect(await handleCaptions(published, world({ video: { captions: [{ lang: 'vi', auto: false }] } }).deps)).toMatchObject({ reason: 'owner already has captions' });
    expect(await handleCaptions(published, world({ size: 3 * 1024 ** 3 }).deps)).toMatchObject({ reason: 'source larger than 2 GB' });
  });

  it('refuses when the month is used up and leaves the counter alone', async () => {
    const w = world({ used: 20 * 60 - 30 });
    expect(await handleCaptions(published, w.deps)).toMatchObject({ reason: 'monthly minutes used up' });
    expect(w.started).toHaveLength(0);
    expect(w.used.get(`${ownerId}:2026-11`)).toBe(20 * 60 - 30);
  });

  it('gives the seconds back when starting the job fails', async () => {
    const w = world();
    w.deps.startJob = async () => { throw new Error('throttled'); };
    await expect(handleCaptions(published, w.deps)).rejects.toThrow('throttled');
    expect(w.used.get(`${ownerId}:2026-11`)).toBe(0);
  });

  it('treats accounts created before the plans as Pro', async () => {
    const old = { createdAt: new Date('2026-10-01T00:00:00Z') };
    expect(await handleCaptions(published, world({ user: old, video: { durationSec: 25 * 60 } }).deps)).toMatchObject({ action: 'started' });
  });
});

describe('automatic captions: finish', () => {
  it('copies the subtitle file next to the video and adds an automatic track', async () => {
    const w = world({ job: { status: 'COMPLETED', languageCode: 'vi-VN', failureReason: null } });
    expect(await handleCaptions(transcribe('COMPLETED'), w.deps)).toEqual({ action: 'added', lang: 'vi' });
    expect([...w.written.keys()]).toEqual([`proc-b/videos/${videoId}/v1/captions/vi.vtt`]);
    expect(w.added).toEqual([{ lang: 'vi', label: expect.stringContaining('Vi'), path: `videos/${videoId}/v1/captions/vi.vtt` }]);
  });

  it('keeps an owner track of the same language', async () => {
    const w = world({ job: { status: 'COMPLETED', languageCode: 'en-US', failureReason: null }, video: { captions: [{ lang: 'en', auto: false }] } });
    expect(await handleCaptions(transcribe('COMPLETED'), w.deps)).toMatchObject({ reason: 'owner already has this language' });
    expect(w.written.size).toBe(0);
  });

  it('refunds the minutes of a failed job and ignores jobs of other environments', async () => {
    const w = world({ used: 60, job: { status: 'FAILED', languageCode: null, failureReason: 'bad media' } });
    expect(await handleCaptions(transcribe('FAILED'), w.deps)).toMatchObject({ reason: 'job failed' });
    expect(w.used.get(`${ownerId}:2026-11`)).toBe(0);
    const other = { source: 'aws.transcribe', detail: { TranscriptionJobName: `zelos-prod-${videoId}-1`, TranscriptionJobStatus: 'COMPLETED' } };
    expect(await handleCaptions(other, w.deps)).toEqual({ action: 'skipped', reason: 'not our job' });
  });

  it('rejects output that is not WebVTT and a language the site does not offer', async () => {
    expect(await handleCaptions(transcribe('COMPLETED'), world({ job: { status: 'COMPLETED', languageCode: 'vi-VN', failureReason: null }, vtt: '<html>' }).deps)).toMatchObject({ reason: 'output is not WebVTT' });
    expect(await handleCaptions(transcribe('COMPLETED'), world({ job: { status: 'COMPLETED', languageCode: 'fr-FR', failureReason: null } }).deps)).toMatchObject({ reason: 'language not offered' });
  });

  it('parses job names back into the video and version', () => {
    expect(parseJobName(PREFIX, jobName(PREFIX, videoId, 7))).toEqual({ videoId, uploadVersion: 7 });
    expect(parseJobName(PREFIX, 'zelos-staging-nope')).toBeNull();
  });
});
