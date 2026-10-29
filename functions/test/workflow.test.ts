import { describe, expect, it } from 'vitest';
import { applyProgress, rawObjectKey, type ProgressState, type TranscodeProgress } from '@zelos/shared';
import { start, type StarterDeps } from '../src/starter.js';
import { handle, type StatusDeps, type VideoDoc, type VideoStore } from '../src/status.js';

const videoId = '6a78c10f1c4541ef615cf01d';
const ownerId = '6a78c10f1c4541ef615cf01e';

// ── starter ───────────────────────────────────────────────────────────

const s3Event = (key: string, eventName = 'ObjectCreated:Post') => ({
  messageId: `m-${key}`,
  body: JSON.stringify({ Records: [{ eventName, s3: { bucket: { name: 'raw-bucket' }, object: { key: encodeURIComponent(key), size: 123 } } }] }),
});

function starterDeps(metadata: Record<string, string>) {
  const started = new Set<string>();
  const logs: Record<string, unknown>[] = [];
  const deps: StarterDeps = {
    headMetadata: async () => metadata,
    startExecution: async (name) => {
      if (started.has(name)) return false;
      started.add(name);
      return true;
    },
    log: (e) => logs.push(e),
  };
  return { deps, started, logs };
}

const goodMeta = { 'video-id': videoId, 'upload-version': '1', 'owner-id': ownerId };

describe('starter', () => {
  it('starts one execution named after the video and upload version', async () => {
    const { deps, started } = starterDeps(goodMeta);
    const out = await start({ Records: [s3Event(rawObjectKey(videoId, 1))] }, deps);
    expect(out.batchItemFailures).toEqual([]);
    expect([...started]).toEqual([`${videoId}-1`]);
  });

  it('starts nothing new for a duplicate S3 event', async () => {
    const { deps, started, logs } = starterDeps(goodMeta);
    await start({ Records: [s3Event(rawObjectKey(videoId, 1))] }, deps);
    await start({ Records: [s3Event(rawObjectKey(videoId, 1))] }, deps);
    expect(started.size).toBe(1);
    expect(logs.at(-1)?.['msg']).toMatch(/duplicate/);
  });

  it('reports only the bad record of a batch as failed', async () => {
    const { deps } = starterDeps({ ...goodMeta, 'video-id': 'nope' });
    const out = await start({ Records: [s3Event(rawObjectKey(videoId, 1))] }, deps);
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: `m-${rawObjectKey(videoId, 1)}` }]);
  });

  it('refuses metadata that disagrees with the object key', async () => {
    const { deps, started } = starterDeps({ ...goodMeta, 'upload-version': '2' });
    const out = await start({ Records: [s3Event(rawObjectKey(videoId, 1))] }, deps);
    expect(out.batchItemFailures).toHaveLength(1);
    expect(started.size).toBe(0);
  });

  it('ignores the S3 test event, other event types and keys outside the raw layout', async () => {
    const { deps, started } = starterDeps(goodMeta);
    await start({ Records: [{ messageId: 't', body: JSON.stringify({ Event: 's3:TestEvent' }) }] }, deps);
    await start({ Records: [s3Event(rawObjectKey(videoId, 1), 'ObjectRemoved:Delete'), s3Event('raw/other/file.mp4')] }, deps);
    expect(started.size).toBe(0);
  });
});

// ── status ────────────────────────────────────────────────────────────

/** In-memory store with the same guards as the MongoDB one. */
function memoryStore(initial: VideoDoc & Record<string, unknown>) {
  const doc: VideoDoc & Record<string, unknown> = { ...initial };
  const store: VideoStore = {
    async startProcessing(id, v, progress: ProgressState, keyRef) {
      if (id !== doc._id || v !== doc.uploadVersion || !['UPLOADING', 'ERROR', 'PROCESSING'].includes(doc.status)) return null;
      Object.assign(doc, { status: 'PROCESSING', progress, keyRef, processingProgress: 0 });
      return doc;
    },
    async recordProgress(id, v, event: TranscodeProgress) {
      if (id !== doc._id || v !== doc.uploadVersion || doc.status !== 'PROCESSING') return null;
      doc.progress = applyProgress(doc.progress!, event);
      return doc;
    },
    async setOverallProgress(_id, _v, percent) {
      doc['processingProgress'] = Math.max(Number(doc['processingProgress'] ?? 0), percent);
    },
    async publish(id, v, fields) {
      if (id !== doc._id || v !== doc.uploadVersion || doc.status !== 'PROCESSING') return null;
      Object.assign(doc, fields, { status: doc.publishAt && doc.publishAt > new Date('2026-11-01T00:00:00Z') ? 'SCHEDULED' : 'READY' });
      return doc;
    },
    async fail(id, v, reason) {
      if (id !== doc._id || v !== doc.uploadVersion || !['UPLOADING', 'PROCESSING'].includes(doc.status)) return null;
      Object.assign(doc, { status: 'ERROR', error: reason });
      return { ...doc };
    },
    async release(id, v, at) {
      if (id !== doc._id || v !== doc.uploadVersion || doc.status !== 'SCHEDULED' || !doc.publishAt || doc.publishAt.getTime() > at.getTime() + 60_000) return null;
      Object.assign(doc, { status: 'READY', publishAt: null });
      return doc;
    },
  };
  return { store, doc };
}

function statusDeps(store: VideoStore, work: Record<string, unknown> = {}) {
  const keys = new Map<string, string>();
  const published: unknown[] = [];
  const alerts: string[] = [];
  const deps: StatusDeps = {
    videos: store,
    putKeyIfAbsent: async (k, body) => {
      if (keys.has(k)) return false;
      keys.set(k, body);
      return true;
    },
    readWork: async <T>(k: string) => ((new Map(Object.entries(work)).get(k) ?? null) as T | null),
    emitPublished: async (d) => { published.push(d); },
    alert: async (s) => { alerts.push(s); },
    now: () => new Date('2026-11-01T00:00:00Z'),
    log: () => undefined,
  };
  return { deps, keys, published, alerts };
}

const base = { _id: videoId, owner: ownerId, status: 'UPLOADING', uploadVersion: 1, publishAt: null };
const encodeResult = { master: `videos/${videoId}/v1/master.m3u8`, rungs: [], durationSec: 60 };
const workFor = (moderation: object | null) => ({
  [`work/${videoId}/v1/encode.json`]: encodeResult,
  [`work/${videoId}/v1/analyse.json`]: { thumbnail: 't.jpg', previewVtt: 'p.vtt', moderation },
});
const clean = { status: 'approved', labels: [], framesAnalyzed: 12, framesPlanned: 12, hasViolence: false, error: null };

describe('status', () => {
  it('start creates one key, keeps it on a retry, and moves the video to PROCESSING', async () => {
    const { store, doc } = memoryStore(base);
    const { deps, keys } = statusDeps(store);
    expect(await handle({ action: 'start', videoId, uploadVersion: 1 }, deps)).toEqual({ found: true, status: 'PROCESSING' });
    const first = keys.get(`keys/${videoId}/v1.json`);
    await handle({ action: 'start', videoId, uploadVersion: 1 }, deps);
    expect(keys.get(`keys/${videoId}/v1.json`)).toBe(first);
    expect(doc.status).toBe('PROCESSING');
  });

  it('start reports a deleted or newer video as not found', async () => {
    const { store } = memoryStore({ ...base, uploadVersion: 2 });
    const { deps } = statusDeps(store);
    expect(await handle({ action: 'start', videoId, uploadVersion: 1 }, deps)).toEqual({ found: false });
  });

  it('folds progress events from both branches and ignores events of an old version', async () => {
    const { store, doc } = memoryStore(base);
    const { deps } = statusDeps(store);
    await handle({ action: 'start', videoId, uploadVersion: 1 }, deps);
    const ev = (detail: object) => ({ source: 'zelos.transcoder', 'detail-type': 'TranscodeProgress', detail: { videoId, uploadVersion: 1, ...detail } });
    await handle(ev({ step: 'encode', percent: 40 }), deps);
    await handle(ev({ step: 'analyse', percent: 100 }), deps);
    expect(doc['processingProgress']).toBe(Math.floor(15 + 0.85 * 40));
    expect(await handle({ ...ev({ step: 'encode', percent: 90 }), detail: { videoId, uploadVersion: 9, step: 'encode', percent: 90 } }, deps)).toEqual({ found: false });
  });

  it('publish sets READY with the package and moderation results and announces it once', async () => {
    const { store, doc } = memoryStore({ ...base, status: 'PROCESSING', progress: { analyse: 0, encode: 0, audio: 0, chunksDone: [], chunkCount: 0 } });
    const { deps, published } = statusDeps(store, workFor(clean));
    expect(await handle({ action: 'publish', videoId, uploadVersion: 1 }, deps)).toEqual({ found: true, status: 'READY', published: true });
    expect(await handle({ action: 'publish', videoId, uploadVersion: 1 }, deps)).toEqual({ found: true, published: false });
    expect(doc['hlsPath']).toBe(encodeResult.master);
    expect(published).toHaveLength(1);
  });

  it('publish does not announce a video that moderation removed or sent to review', async () => {
    const { store } = memoryStore({ ...base, status: 'PROCESSING' });
    const { deps, published } = statusDeps(store, workFor({ ...clean, status: 'review' }));
    await handle({ action: 'publish', videoId, uploadVersion: 1 }, deps);
    expect(published).toHaveLength(0);
  });

  it('publish keeps a future publishAt as SCHEDULED without announcing it', async () => {
    const { store, doc } = memoryStore({ ...base, status: 'PROCESSING', publishAt: new Date('2026-12-01T00:00:00Z') });
    const { deps, published } = statusDeps(store, workFor(clean));
    await handle({ action: 'publish', videoId, uploadVersion: 1 }, deps);
    expect(doc.status).toBe('SCHEDULED');
    expect(published).toHaveLength(0);
  });

  it('release publishes a due scheduled video once and announces it if public and approved', async () => {
    const { store, doc } = memoryStore({ ...base, status: 'SCHEDULED', publishAt: new Date('2026-11-01T00:00:00Z'), visibility: 'public', moderationStatus: 'approved' });
    const { deps, published } = statusDeps(store);
    expect(await handle({ action: 'release', videoId, uploadVersion: 1 }, deps)).toEqual({ found: true, status: 'READY', published: true });
    expect(doc.status).toBe('READY');
    expect(published).toHaveLength(1);
    expect(await handle({ action: 'release', videoId, uploadVersion: 1 }, deps)).toEqual({ found: false });
    expect(published).toHaveLength(1);
  });

  it('release does nothing while processing, for a later publishAt or an older version', async () => {
    for (const over of [{ status: 'PROCESSING' }, { status: 'SCHEDULED', publishAt: new Date('2026-11-02T00:00:00Z') }, { status: 'SCHEDULED', uploadVersion: 2 }]) {
      const { store, doc } = memoryStore({ ...base, publishAt: new Date('2026-10-31T00:00:00Z'), visibility: 'public', moderationStatus: 'approved', ...over });
      const { deps, published } = statusDeps(store);
      expect(await handle({ action: 'release', videoId, uploadVersion: 1 }, deps)).toEqual({ found: false });
      expect(doc.status).toBe(over.status);
      expect(published).toHaveLength(0);
    }
  });

  it('release of an unlisted video publishes without announcing it', async () => {
    const { store } = memoryStore({ ...base, status: 'SCHEDULED', publishAt: new Date('2026-10-31T00:00:00Z'), visibility: 'unlisted', moderationStatus: 'approved' });
    const { deps, published } = statusDeps(store);
    await handle({ action: 'release', videoId, uploadVersion: 1 }, deps);
    expect(published).toHaveLength(0);
  });

  it('publish without a package result fails instead of publishing nothing', async () => {
    const { store } = memoryStore({ ...base, status: 'PROCESSING' });
    const { deps } = statusDeps(store, {});
    await expect(handle({ action: 'publish', videoId, uploadVersion: 1 }, deps)).rejects.toThrow(/no package result/);
  });

  it('fail sets ERROR with the reason and alerts operators', async () => {
    const { store, doc } = memoryStore({ ...base, status: 'PROCESSING' });
    const { deps, alerts } = statusDeps(store);
    await handle({ action: 'fail', videoId, uploadVersion: 1, error: { Error: 'States.TaskFailed', Cause: 'ffmpeg exited with code 1' } }, deps);
    expect(doc.status).toBe('ERROR');
    expect(String(doc['error'])).toContain('ffmpeg exited');
    expect(alerts).toHaveLength(1);
  });

  it('refuses an unknown action', async () => {
    const { store } = memoryStore(base);
    const { deps } = statusDeps(store);
    await expect(handle({ action: 'explode', videoId, uploadVersion: 1 }, deps)).rejects.toThrow();
  });
});
