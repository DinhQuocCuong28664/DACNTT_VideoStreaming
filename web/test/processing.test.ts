import { describe, expect, it } from 'vitest';
import { processingPercent, processingStage } from '../src/lib/processing';

describe('processingStage', () => {
  it('follows the reported step', () => {
    expect(processingStage('queued', 0)).toBe('queued');
    expect(processingStage('probe', 0)).toBe('starting');
    expect(processingStage('analyse', 5)).toBe('preparing');
    expect(processingStage('encode', 40)).toBe('transcoding');
    expect(processingStage('stitch', 85)).toBe('transcoding');
    expect(processingStage('publish', 99)).toBe('finalizing');
  });

  it('uses the percent once the task reports during probe', () => {
    expect(processingStage('probe', 10)).toBe('preparing');
    expect(processingStage('probe', 50)).toBe('transcoding');
  });

  it('falls back to the percent without a known step', () => {
    expect(processingStage(undefined, 0)).toBe('queued');
    expect(processingStage(undefined, 30)).toBe('transcoding');
    expect(processingStage('unknown', 95)).toBe('finalizing');
  });
});

describe('processingPercent', () => {
  it('rounds and clamps', () => {
    expect(processingPercent(undefined)).toBe(0);
    expect(processingPercent(42.6)).toBe(43);
    expect(processingPercent(-3)).toBe(0);
    expect(processingPercent(140)).toBe(100);
  });
});
