import { describe, expect, it } from 'vitest';
import { gopFrames, parseRational } from '../src/media/rational.js';
import { chunkEligibility, displaySize, estimateFrameCount, summarizeProbe, type FfprobeOutput } from '../src/media/probe.js';
import { MAX_ARRAY_SIZE, buildChunkPlan, chooseGopsPerChunk } from '../src/media/chunkPlan.js';
import { buildTranscodePlan } from '../src/media/transcodePlan.js';

const fps30 = { num: 30, den: 1 };
const ntsc = { num: 30000, den: 1001 };

const probe = (over: { video?: object; audio?: object | null; format?: object } = {}): FfprobeOutput => ({
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '30/1', r_frame_rate: '30/1', start_time: '0', ...over.video },
    ...(over.audio === null ? [] : [{ index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, start_time: '0', ...over.audio }]),
  ],
  format: { duration: '600', start_time: '0', ...over.format },
});

describe('parseRational', () => {
  it('reads fractions, integers, NTSC decimals and objects in lowest terms', () => {
    expect(parseRational('60/2')).toEqual({ num: 30, den: 1 });
    expect(parseRational('25')).toEqual({ num: 25, den: 1 });
    expect(parseRational(30000 / 1001)).toEqual(ntsc);
    expect(parseRational(24000 / 1001)).toEqual({ num: 24000, den: 1001 });
    expect(parseRational(59.94)).toBeNull(); // a rounded decimal is not an exact NTSC rate
    expect(parseRational({ num: 50, den: 2 })).toEqual({ num: 25, den: 1 });
  });

  it('refuses junk, zero and negative values instead of returning 0', () => {
    for (const v of ['0/0', '30/0', 'abc', '', -5, 0, Number.NaN, null, undefined]) {
      expect(parseRational(v)).toBeNull();
    }
  });

  it('never gives a zero-frame GOP, even at very low frame rates', () => {
    expect(gopFrames({ num: 1, den: 10 }, 6)).toBe(1);
    expect(gopFrames(ntsc, 6)).toBe(180);
  });
});

describe('summarizeProbe', () => {
  it('prefers avg_frame_rate and keeps r_frame_rate apart', () => {
    const s = summarizeProbe(probe({ video: { avg_frame_rate: '30000/1001', r_frame_rate: '90000/1' } }));
    expect(s.video?.fps).toEqual(ntsc);
    expect(s.video?.baseFps).toEqual({ num: 90000, den: 1 });
  });

  it('treats an unreadable avg_frame_rate as unknown', () => {
    expect(summarizeProbe(probe({ video: { avg_frame_rate: '0/0' } })).video?.fps).toBeNull();
  });

  it('skips cover art and picks the audio stream with most channels', () => {
    const s = summarizeProbe({
      streams: [
        { index: 0, codec_type: 'video', width: 600, height: 600, disposition: { attached_pic: 1 } },
        { index: 1, codec_type: 'video', width: 1280, height: 720, avg_frame_rate: '25/1' },
        { index: 2, codec_type: 'audio', channels: 2 },
        { index: 3, codec_type: 'audio', channels: 6 },
      ],
      format: {},
    });
    expect(s.video?.index).toBe(1);
    expect(s.audio?.index).toBe(3);
  });

  it('reports no audio for silent sources', () => {
    expect(summarizeProbe(probe({ audio: null })).audio).toBeNull();
  });

  it('swaps width and height for rotated phone video (display matrix and legacy tag)', () => {
    expect(displaySize({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] })).toEqual({ width: 1080, height: 1920 });
    expect(displaySize({ width: 1920, height: 1080, tags: { rotate: '270' } })).toEqual({ width: 1080, height: 1920 });
    expect(displaySize({ width: 1920, height: 1080, side_data_list: [{ rotation: 180 }] })).toEqual({ width: 1920, height: 1080 });
  });

  it('applies a non-square sample aspect ratio', () => {
    expect(displaySize({ width: 720, height: 576, sample_aspect_ratio: '16:11' })).toEqual({ width: 1047, height: 576 });
  });

  it('estimates frames from nb_frames, then stream duration, then file duration', () => {
    expect(estimateFrameCount(summarizeProbe(probe({ video: { nb_frames: '1234' } })))).toBe(1234);
    expect(estimateFrameCount(summarizeProbe(probe({ video: { duration: '10' } })))).toBe(300);
    expect(estimateFrameCount(summarizeProbe(probe({ format: { duration: '20' } })))).toBe(600);
    expect(estimateFrameCount(summarizeProbe(probe({ format: { duration: undefined } })))).toBe(0);
  });
});

describe('chunkEligibility', () => {
  it('accepts a normal CFR source and small rounding between rates', () => {
    expect(chunkEligibility(summarizeProbe(probe()))).toEqual({ ok: true });
    expect(chunkEligibility(summarizeProbe(probe({ video: { avg_frame_rate: '2997/100', r_frame_rate: '30000/1001' } })))).toEqual({ ok: true });
  });

  it('refuses variable frame rate sources that report 90000/1', () => {
    const r = chunkEligibility(summarizeProbe(probe({ video: { r_frame_rate: '90000/1' } })));
    expect(r.ok).toBe(false);
  });

  it('refuses audio that starts more than 0.25 s away from the picture', () => {
    expect(chunkEligibility(summarizeProbe(probe({ audio: { start_time: '0.4' } }))).ok).toBe(false);
    expect(chunkEligibility(summarizeProbe(probe({ audio: { start_time: '0.1' } }))).ok).toBe(true);
  });

  it('refuses unknown duration and implausible frame rates', () => {
    expect(chunkEligibility(summarizeProbe(probe({ format: { duration: undefined } }))).ok).toBe(false);
    expect(chunkEligibility(summarizeProbe(probe({ video: { avg_frame_rate: '5/1', r_frame_rate: '5/1' } }))).ok).toBe(false);
  });
});

describe('buildChunkPlan', () => {
  const fourHours = 4 * 3600 * 30;

  it('splits a 4-hour 30 fps video into 48 chunks of 50 segments', () => {
    const plan = buildChunkPlan({ frameCount: fourHours, fps: fps30, gopsPerChunk: 50 });
    expect(plan.chunks).toHaveLength(48);
    expect(plan.chunks[0]!.expectedSegments).toBe(50);
    expect(plan.chunkSeconds).toBe(300);
  });

  it('makes chunk windows meet exactly and audio windows meet to the microsecond', () => {
    const plan = buildChunkPlan({ frameCount: fourHours, fps: ntsc, gopsPerChunk: 50 });
    for (const [k, a] of plan.chunks.slice(0, -1).entries()) {
      const b = plan.chunks.at(k + 1)!;
      expect(a.seekSeconds + a.durationSeconds!).toBeCloseTo(b.seekSeconds, 5);
      expect(a.audioSeekSeconds + a.audioDurationSeconds!).toBeCloseTo(b.audioSeekSeconds, 6);
      expect(b.tsOffsetSeconds - a.tsOffsetSeconds).toBeCloseTo(plan.chunkSeconds, 5);
    }
  });

  it('seeks half a frame before the first frame and never negative', () => {
    const plan = buildChunkPlan({ frameCount: 100_000, fps: fps30, gopsPerChunk: 10 });
    expect(plan.chunks[0]!.seekSeconds).toBe(0);
    expect(plan.chunks[1]!.seekSeconds).toBeCloseTo(plan.chunks[1]!.audioSeekSeconds - 1 / 60, 6);
  });

  it('leaves the last chunk open-ended', () => {
    const last = buildChunkPlan({ frameCount: 10_000, fps: fps30, gopsPerChunk: 10 }).chunks.at(-1)!;
    expect(last.durationSeconds).toBeNull();
    expect(last.frames).toBeNull();
  });

  it('folds a remainder shorter than one GOP into the previous chunk', () => {
    const plan = buildChunkPlan({ frameCount: 2 * 1800 + 100, fps: fps30, gopsPerChunk: 10 });
    expect(plan.chunks).toHaveLength(2);
  });

  it('keeps a 48-hour video under the array job limit', () => {
    const plan = buildChunkPlan({ frameCount: 48 * 3600 * 30, fps: fps30, gopsPerChunk: 50 });
    expect(plan.chunks.length).toBeLessThanOrEqual(MAX_ARRAY_SIZE);
  });

  it('refuses invalid input instead of producing a wrong plan', () => {
    expect(() => buildChunkPlan({ frameCount: 0, fps: fps30, gopsPerChunk: 10 })).toThrow();
    expect(() => buildChunkPlan({ frameCount: 1000, fps: fps30, gopsPerChunk: 1.5 })).toThrow();
  });
});

describe('chooseGopsPerChunk', () => {
  it('keeps 5-minute chunks without a capacity hint', () => {
    expect(chooseGopsPerChunk({ frameCount: 25 * 60 * 30, fps: fps30 })).toBe(50);
  });

  it('shrinks chunks of a 25-minute video to use the available slots', () => {
    expect(chooseGopsPerChunk({ frameCount: 25 * 60 * 30, fps: fps30, targetChunks: 12 })).toBe(21);
  });

  it('never goes below the minimum nor above the maximum', () => {
    expect(chooseGopsPerChunk({ frameCount: 3 * 60 * 30, fps: fps30, targetChunks: 24 })).toBe(10);
    expect(chooseGopsPerChunk({ frameCount: 4 * 3600 * 30, fps: fps30, targetChunks: 12 })).toBe(50);
  });
});

describe('buildTranscodePlan', () => {
  it('sends short videos down the single-job path with the full ladder', () => {
    const plan = buildTranscodePlan(summarizeProbe(probe({ format: { duration: '120' } })));
    expect(plan.mode).toBe('single');
    expect(plan.renditions).toHaveLength(6);
    expect(plan.audioBitratesKbps).toEqual([64, 128]);
    expect(plan.fpsKnown).toBe(true);
  });

  it('marks a guessed frame rate so the master does not claim it', () => {
    const plan = buildTranscodePlan(summarizeProbe(probe({ video: { avg_frame_rate: '0/0' }, format: { duration: '60' } })));
    expect(plan.fps).toEqual({ num: 30, den: 1 });
    expect(plan.fpsKnown).toBe(false);
  });

  it('chunks long CFR videos and sizes chunks to the slots', () => {
    const plan = buildTranscodePlan(summarizeProbe(probe({ format: { duration: '1500' } })), { parallelSlots: 4 });
    expect(plan.mode).toBe('chunked');
    if (plan.mode === 'chunked') {
      expect(plan.chunkPlan.chunks.length).toBeGreaterThanOrEqual(10);
      expect(plan.renditions).toHaveLength(6);
    }
  });

  it('falls back to a single job with a reason for long VFR sources', () => {
    const plan = buildTranscodePlan(summarizeProbe(probe({ video: { r_frame_rate: '90000/1' }, format: { duration: '3600' } })));
    expect(plan.mode).toBe('single');
    if (plan.mode === 'single') {
      expect(plan.fallbackReason).toMatch(/variable frame rate/);
      expect(plan.renditions.map((r) => r.name)).toEqual(['360p', '720p', '1080p']);
    }
  });

  it('plans no audio for silent sources', () => {
    const plan = buildTranscodePlan(summarizeProbe(probe({ audio: null, format: { duration: '60' } })));
    expect(plan.hasAudio).toBe(false);
    expect(plan.audioBitratesKbps).toEqual([]);
  });

  it('refuses a source without video', () => {
    expect(() => buildTranscodePlan(summarizeProbe({ streams: [{ codec_type: 'audio' }], format: {} }))).toThrow();
  });
});
