import { describe, expect, it } from 'vitest';
import { coverageShortfall } from '../src/hls/playlist.js';

describe('coverageShortfall', () => {
  it('reports the gap of the truncated recording found by the fault test', () => {
    // 279.9 s probed, 19 segments of about 6 s written before the damaged part.
    expect(coverageShortfall(279.895, 113.4, 6)).toBeCloseTo(166.495, 3);
  });

  it('accepts an output within one segment of a short video', () => {
    expect(coverageShortfall(36, 31, 6)).toBeNull();
    expect(coverageShortfall(36, 29.9, 6)).toBeCloseTo(6.1, 3);
  });

  it('allows 1 % of a long video, more than one segment', () => {
    // One hour: the margin is 36 s, not 6 s.
    expect(coverageShortfall(3600, 3570, 6)).toBeNull();
    expect(coverageShortfall(3600, 3560, 6)).toBe(40);
  });

  it('never flags an output that is as long as or longer than the probe', () => {
    expect(coverageShortfall(60, 60.02, 6)).toBeNull();
    expect(coverageShortfall(60, 66, 6)).toBeNull();
  });

  it('skips the check when the duration is unknown', () => {
    expect(coverageShortfall(null, 10, 6)).toBeNull();
    expect(coverageShortfall(Number.NaN, 10, 6)).toBeNull();
    expect(coverageShortfall(0, 10, 6)).toBeNull();
  });
});
