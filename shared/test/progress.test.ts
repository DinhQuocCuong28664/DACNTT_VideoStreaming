import { describe, expect, it } from 'vitest';
import { applyProgress, emptyProgress, overallPercent } from '../src/progress.js';

const ev = (step: 'analyse' | 'encode' | 'stitch', percent: number, part?: number, parts?: number) => ({
  videoId: 'a'.repeat(24), uploadVersion: 1, step, percent, ...(part === undefined ? {} : { part, parts }),
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

  it('counts finished chunks in any order, each once', () => {
    let s = emptyProgress(4);
    for (const part of [3, 0, 3]) s = applyProgress(s, ev('encode', 100, part, 4));
    expect(s.chunksDone.sort()).toEqual([0, 3]);
    expect(overallPercent(s)).toBe(Math.floor(0.8 * 50));
  });

  it('stays below 100 until the video is published', () => {
    let s = emptyProgress(2);
    s = applyProgress(s, ev('analyse', 100));
    s = applyProgress(s, ev('encode', 100, 0, 2));
    s = applyProgress(s, ev('encode', 100, 1, 2));
    s = applyProgress(s, ev('stitch', 100));
    expect(overallPercent(s)).toBe(99);
  });
});
