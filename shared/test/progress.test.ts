import { describe, expect, it } from 'vitest';
import { applyProgress, emptyProgress, overallPercent } from '../src/progress.js';

type Step = 'analyse' | 'audio' | 'encode';
const ev = (step: Step, percent: number, extra: { part?: number; parts?: number } = {}) => ({
  videoId: 'a'.repeat(24), uploadVersion: 1, step, percent, ...extra,
});

describe('progress', () => {
  it('weights the parallel analyse and encode branches into one number', () => {
    let s = emptyProgress();
    s = applyProgress(s, ev('encode', 50));
    s = applyProgress(s, ev('analyse', 100));
    expect(overallPercent(s)).toBe(Math.floor(15 + 0.85 * 50));
  });

  it('never goes backwards when a slower event arrives late', () => {
    let s = applyProgress(emptyProgress(), ev('encode', 60));
    s = applyProgress(s, ev('encode', 40));
    expect(s.encode).toBe(60);
  });

  it('switches to the chunked weights as soon as the audio step reports the chunk count', () => {
    let s = applyProgress(emptyProgress(), ev('analyse', 100));
    expect(overallPercent(s)).toBe(15);
    s = applyProgress(s, ev('audio', 50, { parts: 12 }));
    expect(s.chunkCount).toBe(12);
    expect(overallPercent(s)).toBe(15); // 10 % analyse + 5 % audio
  });

  it('counts finished chunks in any order, each once', () => {
    let s = applyProgress(emptyProgress(), ev('audio', 100, { parts: 4 }));
    for (const part of [3, 0, 3]) s = applyProgress(s, ev('encode', 100, { part, parts: 4 }));
    expect([...s.chunksDone].sort()).toEqual([0, 3]);
    expect(overallPercent(s)).toBe(10 + 40);
  });

  it('stays below 100 until the video is published', () => {
    let s = emptyProgress();
    s = applyProgress(s, ev('analyse', 100));
    s = applyProgress(s, ev('audio', 100, { parts: 2 }));
    s = applyProgress(s, ev('encode', 100, { part: 0, parts: 2 }));
    s = applyProgress(s, ev('encode', 100, { part: 1, parts: 2 }));
    expect(overallPercent(s)).toBe(99);
  });
});
