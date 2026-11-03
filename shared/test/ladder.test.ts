import { describe, expect, it } from 'vitest';
import { LADDER, audioBitrates, planRenditions } from '../src/ladder.js';

const names = (plan: { name: string }[]) => plan.map((r) => r.name);

describe('LADDER', () => {
  it('has six rungs ascending from 144p to 1080p', () => {
    expect(names([...LADDER])).toEqual(['144p', '240p', '360p', '480p', '720p', '1080p']);
  });

  it('keeps maxrate at or above zero and bufsize at twice maxrate', () => {
    for (const r of LADDER) {
      expect(r.maxrateKbps).toBeGreaterThan(0);
      expect(r.bufsizeKbit).toBe(r.maxrateKbps * 2);
    }
  });

  it('uses 64k audio up to 480p and 128k above', () => {
    expect(LADDER.map((r) => r.audioKbps)).toEqual([64, 64, 64, 64, 128, 128]);
  });
});

describe('planRenditions', () => {
  it('gives a 1080p source all six rungs at 16:9', () => {
    const plan = planRenditions({ width: 1920, height: 1080, durationSec: 60 });
    expect(names(plan)).toEqual(['144p', '240p', '360p', '480p', '720p', '1080p']);
    expect(plan.at(-1)).toMatchObject({ width: 1920, height: 1080 });
    expect(plan[0]).toMatchObject({ width: 256, height: 144 });
  });

  it('caps a 4K source at 1080p', () => {
    const plan = planRenditions({ width: 3840, height: 2160, durationSec: 60 });
    expect(plan.at(-1)).toMatchObject({ name: '1080p', width: 1920, height: 1080 });
  });

  it('never upscales: a 480p source stops at 480p without a duplicate size', () => {
    const plan = planRenditions({ width: 854, height: 480, durationSec: 60 });
    expect(names(plan)).toEqual(['144p', '240p', '360p', '480p']);
    expect(new Set(plan.map((r) => r.height)).size).toBe(plan.length);
  });

  it('keeps the rung above a between-rungs source at the source size with its own settings', () => {
    const plan = planRenditions({ width: 1000, height: 562, durationSec: 60 });
    const top = plan.at(-1)!;
    expect(top.name).toBe('720p');
    expect(top.height).toBe(562);
    expect(top.crf).toBe(23);
  });

  it('uses portrait frames for portrait sources without padding', () => {
    const plan = planRenditions({ width: 720, height: 1280, durationSec: 60 });
    expect(names(plan)).toEqual(['144p', '240p', '360p', '480p', '720p']);
    expect(plan.at(-1)).toMatchObject({ width: 720, height: 1280 });
    for (const r of plan) expect(r.height).toBeGreaterThan(r.width);
  });

  it('keeps widescreen aspect ratios and even sizes', () => {
    const plan = planRenditions({ width: 1920, height: 800, durationSec: 60 });
    for (const r of plan) {
      expect(r.width % 2).toBe(0);
      expect(r.height % 2).toBe(0);
      expect(r.width / r.height).toBeCloseTo(2.4, 1);
    }
  });

  it('gives a source below 144p exactly one rung at the source size', () => {
    const plan = planRenditions({ width: 176, height: 100, durationSec: 60 });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ name: '144p', width: 176, height: 100 });
  });

  it('gives a source below 240p a 144p rung plus one at the source size', () => {
    const plan = planRenditions({ width: 356, height: 200, durationSec: 60 });
    expect(names(plan)).toEqual(['144p', '240p']);
    expect(plan[1]).toMatchObject({ height: 200 });
  });

  it('keeps the configured landscape frames when the size is unknown', () => {
    const plan = planRenditions({ durationSec: 60 });
    expect(plan).toHaveLength(6);
    expect(plan.at(-1)).toMatchObject({ width: 1920, height: 1080 });
  });

  it('gives long single-job videos only 360p, 720p and 1080p', () => {
    const plan = planRenditions({ width: 1920, height: 1080, durationSec: 3 * 3600 });
    expect(names(plan)).toEqual(['360p', '720p', '1080p']);
  });

  it('switches to the long ladder one second past the threshold, not at it', () => {
    expect(planRenditions({ width: 1920, height: 1080, durationSec: 1200 })).toHaveLength(6);
    expect(planRenditions({ width: 1920, height: 1080, durationSec: 1201 })).toHaveLength(3);
  });

  it('treats an unknown duration as long', () => {
    for (const durationSec of [0, Number.NaN, undefined]) {
      expect(names(planRenditions({ width: 1920, height: 1080, durationSec }))).toEqual(['360p', '720p', '1080p']);
    }
  });

  it('gives the chunked path the full ladder whatever the duration', () => {
    const plan = planRenditions({ width: 1920, height: 1080, durationSec: 4 * 3600, chunked: true });
    expect(plan).toHaveLength(6);
  });

  it('gives a long portrait video three portrait rungs', () => {
    const plan = planRenditions({ width: 1080, height: 1920, durationSec: 3 * 3600 });
    expect(names(plan)).toEqual(['360p', '720p', '1080p']);
    expect(plan.at(-1)).toMatchObject({ width: 1080, height: 1920 });
  });
});

describe('audioBitrates', () => {
  it('lists only the bitrates the plan uses, ascending', () => {
    expect(audioBitrates(planRenditions({ width: 640, height: 360, durationSec: 60 }))).toEqual([64]);
    expect(audioBitrates(planRenditions({ width: 1920, height: 1080, durationSec: 60 }))).toEqual([64, 128]);
  });
});
