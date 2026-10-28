import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildTranscodePlan,
  keyObject,
  parseMediaPlaylist,
  processedPaths,
  rawObjectKey,
  summarizeProbe,
  workPaths,
  type ChunkResult,
  type FfprobeOutput,
  type TranscodePlan,
} from '@zelos/shared';
import { encodeSize, probe } from '../src/probe.js';
import { StitchRefusedError, stitch } from '../src/stitch.js';
import { fakeStore } from './fakeStore.js';

const videoId = '6a78c10f1c4541ef615cf01d';
const ownerId = '6a78c10f1c4541ef615cf01e';

const ffprobeOf = (seconds: number, extra: object = {}): FfprobeOutput => ({
  streams: [
    { index: 0, codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30/1', r_frame_rate: '30/1', start_time: '0', ...extra },
    { index: 1, codec_type: 'audio', channels: 2, start_time: '0' },
  ],
  format: { duration: String(seconds), start_time: '0' },
});

describe('probe', () => {
  const input = { videoId, uploadVersion: 1, ownerId, bucket: 'raw', key: rawObjectKey(videoId, 1), sizeBytes: 10 };

  it('stores the plan in the work bucket and returns a single-path summary for a short clip', async () => {
    const { store, objects } = fakeStore();
    const out = await probe(input, { store, ffprobe: async () => ffprobeOf(60), workBucket: 'work', parallelSlots: 4 });
    expect(out).toMatchObject({ mode: 'single', chunkCount: 0, hasAudio: true, encode: { vcpu: '1' } });
    expect(out.rungs).toHaveLength(6);
    const saved = JSON.parse(objects.get(`work/${workPaths(videoId, 1).plan}`) as string) as TranscodePlan;
    expect(saved.mode).toBe('single');
  });

  it('returns the chunk count for a long CFR source', async () => {
    const { store } = fakeStore();
    const out = await probe(input, { store, ffprobe: async () => ffprobeOf(1500), workBucket: 'work', parallelSlots: 4 });
    expect(out.mode).toBe('chunked');
    expect(out.chunkCount).toBeGreaterThanOrEqual(2);
  });

  it('reports why a long VFR source stays on the single path', async () => {
    const { store } = fakeStore();
    const out = await probe(input, { store, ffprobe: async () => ffprobeOf(3600, { r_frame_rate: '90000/1' }), workBucket: 'work', parallelSlots: 4 });
    expect(out.mode).toBe('single');
    expect(out.fallbackReason).toMatch(/variable frame rate/);
    expect(out.encode.vcpu).toBe('4');
  });

  it('refuses input that does not match the workflow contract', async () => {
    const { store } = fakeStore();
    await expect(probe({ ...input, key: 'videos/x.mp4' }, { store, ffprobe: async () => ffprobeOf(60), workBucket: 'w', parallelSlots: 4 })).rejects.toThrow();
  });

  it('sizes the encode task by duration', () => {
    expect(encodeSize(60)).toEqual({ vcpu: '1', memory: '2048' });
    expect(encodeSize(300)).toEqual({ vcpu: '2', memory: '4096' });
    expect(encodeSize(null)).toEqual({ vcpu: '4', memory: '8192' });
  });
});

describe('stitch', () => {
  const key = Buffer.alloc(16, 9);
  const iv = Buffer.alloc(16, 3);
  const keyJson = JSON.stringify({ keyHex: key.toString('hex'), ivHex: iv.toString('hex') });
  // A segment whose first bytes hold an SPS with profile 0x4d, flags 0x40, level 0x28.
  const encryptedSegment = (() => {
    const plain = Buffer.concat([Buffer.from([0, 0, 0, 1, 0x67, 0x4d, 0x40, 0x28]), Buffer.alloc(56, 0x11)]);
    const c = createCipheriv('aes-128-cbc', key, iv);
    return new Uint8Array(Buffer.concat([c.update(plain), c.final()]));
  })();

  const plan = buildTranscodePlan(summarizeProbe(ffprobeOf(30 * 60)), { parallelSlots: 4 });
  if (plan.mode !== 'chunked') throw new Error('expected a chunked plan');
  const work = workPaths(videoId, 1);
  const processed = processedPaths(videoId, 1);
  const buckets = { work: 'work', processed: 'out', keys: 'keys' };

  function setup(results: ChunkResult[]) {
    const initial: Record<string, string | Uint8Array> = {
      [`work/${work.plan}`]: JSON.stringify(plan),
      [`keys/${keyObject(videoId, 1)}`]: keyJson,
    };
    for (const r of results) initial[`work/${work.chunkResult(r.index)}`] = JSON.stringify(r);
    for (const r of plan.renditions) initial[`out/${processed.rungDir(r.name)}/c0000_000.ts`] = encryptedSegment;
    return fakeStore(initial);
  }

  const goodResults = (): ChunkResult[] => {
    if (plan.mode !== 'chunked') return [];
    return plan.chunkPlan.chunks.map((c) => {
      // The open last chunk holds whatever frames remain.
      const n = c.expectedSegments ?? Math.ceil((plan.chunkPlan.frameCount - c.startFrame) / plan.chunkPlan.gopFrames);
      const rungs: ChunkResult['rungs'] = {};
      for (const r of plan.renditions) {
        rungs[r.name] = {
          segments: Array.from({ length: n }, (_, i) => ({
            uri: `c${String(c.index).padStart(4, '0')}_${String(i).padStart(3, '0')}.ts`,
            duration: plan.chunkPlan.gopSeconds,
            bytes: 100_000 * (1 + plan.renditions.indexOf(r)),
          })),
        };
      }
      return { index: c.index, rungs };
    });
  };

  it('writes every media playlist before the master, with CODECS read from the first segment', async () => {
    const { store, writes } = setup(goodResults());
    const result = await stitch({ videoId, uploadVersion: 1 }, { store, buckets, apiBaseUrl: 'https://api.example/' });
    const keys = writes.filter((w) => w.bucket === 'out').map((w) => w.key);
    expect(keys.at(-1)).toBe(processed.master);
    expect(keys).toHaveLength(plan.renditions.length + 1);
    expect(result.rungs.every((r) => r.codecs === 'avc1.4d4028,mp4a.40.2')).toBe(true);

    const media = writes.find((w) => w.key === processed.mediaPlaylist('720p'))!.body;
    expect(media).toContain(`URI="https://api.example/v1/videos/${videoId}/key?v=1"`);
    expect(parseMediaPlaylist(media).length).toBeGreaterThan(0);
    const master = writes.find((w) => w.key === processed.master)!.body;
    expect(master.indexOf('144p/index.m3u8')).toBeLessThan(master.indexOf('1080p/index.m3u8'));
  });

  it('refuses to publish when a chunk result is missing, and writes no master', async () => {
    const results = goodResults();
    results.splice(1, 1);
    const { store, writes } = setup(results);
    await expect(stitch({ videoId, uploadVersion: 1 }, { store, buckets, apiBaseUrl: 'https://api.example' })).rejects.toBeInstanceOf(StitchRefusedError);
    expect(writes.some((w) => w.key === processed.master)).toBe(false);
  });
});
