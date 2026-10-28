/**
 * Encode guard: stops a run that cannot finish before the job timeout, as soon as that is
 * clear, instead of burning hours of Fargate time and failing at the timeout anyway.
 *
 * Projected total = video duration × (elapsed wall time / encoded position). The guard only
 * judges after a warm-up, and only after the projection has stayed over budget for a sustained
 * period, so one slow stretch never kills a healthy run.
 */
export interface GuardSettings {
  /** Seconds the job may run (the Batch attempt timeout). */
  budgetSec: number;
  /** Fraction of the budget the projection may reach (leaves time to upload). */
  margin: number;
  /** No verdict before this much wall time or this much encoded video. */
  warmupSec: number;
  minEncodedSec: number;
  /** The projection must stay over budget this long before the guard stops the run. */
  sustainSec: number;
}

export const DEFAULT_GUARD: Omit<GuardSettings, 'budgetSec'> = {
  margin: 0.9,
  warmupSec: 120,
  minEncodedSec: 30,
  sustainSec: 180,
};

export interface GuardSample {
  elapsedSec: number;
  encodedSec: number;
}

/** Projected wall time of the whole video, or null when there is not enough evidence yet. */
export function projectTotal(durationSec: number | null, sample: GuardSample, s: GuardSettings): number | null {
  if (!durationSec || durationSec <= 0) return null;
  if (sample.elapsedSec < s.warmupSec || sample.encodedSec < s.minEncodedSec) return null;
  return durationSec * (sample.elapsedSec / sample.encodedSec);
}

export class EncodeTooSlowError extends Error {
  constructor(readonly projectedSec: number, readonly budgetSec: number) {
    super(`encode would take ${Math.round(projectedSec)} s, over the ${budgetSec} s budget`);
    this.name = 'EncodeTooSlowError';
  }
}

/** Keeps state across progress samples; `check` returns an error when the run must stop. */
export function createGuard(durationSec: number | null, settings: GuardSettings) {
  let overSince: number | null = null;
  return {
    check(sample: GuardSample): EncodeTooSlowError | null {
      const projected = projectTotal(durationSec, sample, settings);
      if (projected === null || projected <= settings.budgetSec * settings.margin) {
        overSince = null;
        return null;
      }
      overSince ??= sample.elapsedSec;
      return sample.elapsedSec - overSince >= settings.sustainSec ? new EncodeTooSlowError(projected, settings.budgetSec) : null;
    },
  };
}
