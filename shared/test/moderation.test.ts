import { describe, expect, it } from 'vitest';
import { buildSamplePlan, evaluateFrames, relevantLabels, screenImage } from '../src/moderation/policy.js';

const frame = (labels: object[], timestamp = 1, contentTypes: object[] = []) => ({ labels, timestamp, contentTypes });

describe('relevantLabels', () => {
  it('maps a label by its own name, else by its parent', () => {
    const out = relevantLabels(frame([{ Name: 'Blood & Gore', ParentName: 'Graphic Violence', Confidence: 95 }]));
    expect(out).toEqual([{ name: 'Blood & Gore', parentName: 'Graphic Violence', confidence: 95, action: 'block' }]);
  });

  it('drops a parent whose children are all ignored (bare male chest)', () => {
    const out = relevantLabels(frame([
      { Name: 'Non-Explicit Nudity', Confidence: 90 },
      { Name: 'Exposed Male Nipple', ParentName: 'Non-Explicit Nudity', Confidence: 90 },
    ]));
    expect(out).toEqual([]);
  });

  it('keeps the specific child instead of the top-level parent', () => {
    const out = relevantLabels(frame([
      { Name: 'Violence', Confidence: 92 },
      { Name: 'Graphic Violence', ParentName: 'Violence', Confidence: 92 },
    ]));
    expect(out.map((l) => l.name)).toEqual(['Graphic Violence']);
  });

  it('lowers graphic violence in animation to review', () => {
    const out = relevantLabels(frame([{ Name: 'Graphic Violence', ParentName: 'Violence', Confidence: 95 }], 1, [{ Name: 'Animated', Confidence: 90 }]));
    expect(out.at(0)?.action).toBe('review');
  });

  it('ignores labels outside the policy', () => {
    expect(relevantLabels(frame([{ Name: 'Alcohol', Confidence: 99 }]))).toEqual([]);
  });
});

describe('buildSamplePlan', () => {
  it('samples the middle of equal slices', () => {
    expect(buildSamplePlan(20, { interval: 5, maxFrames: 120 })).toEqual([2.5, 7.5, 12.5, 17.5]);
  });

  it('caps the frame count for long videos by widening the interval', () => {
    const plan = buildSamplePlan(4 * 3600);
    expect(plan).toHaveLength(120);
    expect(plan.at(-1)!).toBeLessThan(4 * 3600);
  });

  it('falls back to the first frame when the duration is unknown', () => {
    expect(buildSamplePlan(null)).toEqual([0]);
    expect(buildSamplePlan(0)).toEqual([0]);
  });
});

describe('evaluateFrames', () => {
  it('approves a clean video', () => {
    const v = evaluateFrames([frame([]), frame([])], 2);
    expect(v.status).toBe('approved');
    expect(v.hasViolence).toBe(false);
  });

  it('removes on a confident block-level label and flags violence', () => {
    const v = evaluateFrames([frame([{ Name: 'Graphic Violence', ParentName: 'Violence', Confidence: 93 }], 12)], 1);
    expect(v.status).toBe('removed');
    expect(v.hasViolence).toBe(true);
    expect(v.labels.at(0)).toMatchObject({ timestamp: 12, frames: 1 });
  });

  it('sends a less confident block-level label to review', () => {
    expect(evaluateFrames([frame([{ Name: 'Graphic Violence', Confidence: 75 }])], 1).status).toBe('review');
  });

  it('ignores labels under the review threshold', () => {
    expect(evaluateFrames([frame([{ Name: 'Violence', Confidence: 40 }])], 1).status).toBe('approved');
  });

  it('sends to review when too few frames could be analysed, or none', () => {
    expect(evaluateFrames([frame([])], 10).status).toBe('review');
    expect(evaluateFrames([], 10)).toMatchObject({ status: 'review', error: 'no frame could be analysed' });
  });

  it('counts frames per label and keeps the strongest action and confidence', () => {
    const v = evaluateFrames([
      frame([{ Name: 'Violence', Confidence: 70 }], 1),
      frame([{ Name: 'Violence', Confidence: 85 }], 2),
    ], 2);
    expect(v.labels.at(0)).toMatchObject({ name: 'Violence', frames: 2, confidence: 85, timestamp: 2 });
  });
});

describe('screenImage', () => {
  it('refuses review-level labels as firmly as block-level ones', () => {
    expect(screenImage({ labels: [{ Name: 'Non-Explicit Nudity', Confidence: 70 }] }).allowed).toBe(false);
    expect(screenImage({ labels: [{ Name: 'Explicit Nudity', Confidence: 99 }] }).allowed).toBe(false);
  });

  it('accepts ignored labels and labels below the threshold', () => {
    expect(screenImage({ labels: [{ Name: 'Weapons', Confidence: 99 }, { Name: 'Violence', Confidence: 30 }] }).allowed).toBe(true);
  });
});
