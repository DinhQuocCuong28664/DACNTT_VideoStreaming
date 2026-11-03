import { describe, expect, it } from 'vitest';
import { DEFAULT_GUARD, EncodeTooSlowError, createGuard, projectTotal } from '../src/ffmpeg/guard.js';

const settings = { ...DEFAULT_GUARD, budgetSec: 3600 };

describe('projectTotal', () => {
  it('has no verdict without a duration, during warm-up or with too little encoded', () => {
    expect(projectTotal(null, { elapsedSec: 600, encodedSec: 100 }, settings)).toBeNull();
    expect(projectTotal(1000, { elapsedSec: 60, encodedSec: 5 }, settings)).toBeNull();
    expect(projectTotal(1000, { elapsedSec: 600, encodedSec: 10 }, settings)).toBeNull();
  });

  it('projects duration × elapsed / encoded', () => {
    expect(projectTotal(1000, { elapsedSec: 200, encodedSec: 100 }, settings)).toBe(2000);
  });
});

describe('createGuard', () => {
  it('lets a run that fits the budget continue', () => {
    const guard = createGuard(1600, settings); // 26.7 minutes at factor 1.2 = 32 minutes
    for (let t = 120; t <= 1800; t += 60) expect(guard.check({ elapsedSec: t, encodedSec: t / 1.2 })).toBeNull();
  });

  it('stops a 4-hour video at factor 3.7 within minutes, not at the timeout', () => {
    const guard = createGuard(4 * 3600, settings);
    let stopped: EncodeTooSlowError | null = null;
    let at = 0;
    for (let t = 120; t <= 3600 && !stopped; t += 30) {
      stopped = guard.check({ elapsedSec: t, encodedSec: t / 3.7 });
      at = t;
    }
    expect(stopped).toBeInstanceOf(EncodeTooSlowError);
    expect(at).toBeLessThanOrEqual(120 + settings.sustainSec + 30);
  });

  it('ignores a slow stretch shorter than the sustain period', () => {
    const guard = createGuard(1000, settings);
    expect(guard.check({ elapsedSec: 300, encodedSec: 50 })).toBeNull(); // projected 6000 s
    expect(guard.check({ elapsedSec: 400, encodedSec: 50 })).toBeNull();
    expect(guard.check({ elapsedSec: 500, encodedSec: 400 })).toBeNull(); // back under budget
    expect(guard.check({ elapsedSec: 700, encodedSec: 450 })).toBeNull(); // over again, timer restarted
  });

  it('never stops a video of unknown length', () => {
    const guard = createGuard(null, settings);
    expect(guard.check({ elapsedSec: 3000, encodedSec: 10 })).toBeNull();
  });

  it('accepts a run at exactly budget × margin and stops one slightly over', () => {
    const exact = createGuard(1000, settings);
    const factor = (3600 * 0.9) / 1000;
    expect(exact.check({ elapsedSec: 300, encodedSec: 300 / factor })).toBeNull();
    const over = createGuard(1000, settings);
    over.check({ elapsedSec: 300, encodedSec: 300 / (factor * 1.01) });
    expect(over.check({ elapsedSec: 300 + settings.sustainSec, encodedSec: (300 + settings.sustainSec) / (factor * 1.01) })).toBeInstanceOf(EncodeTooSlowError);
  });
});
