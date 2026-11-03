/**
 * What the owner sees while a video is being processed. The stage follows the pipeline step
 * the workflow reported (shared/src/videoState.ts); the percent only moves once the Fargate
 * task runs, so the first minute (queue, task start) has its own stages instead of a bar at 0.
 */
export type ProcessingStage = 'queued' | 'starting' | 'preparing' | 'transcoding' | 'finalizing';

const BY_STEP: ReadonlyMap<string, ProcessingStage> = new Map([
  ['queued', 'queued'],
  ['probe', 'starting'],
  ['analyse', 'preparing'],
  ['audio', 'transcoding'],
  ['encode', 'transcoding'],
  ['stitch', 'transcoding'],
  ['publish', 'finalizing'],
]);

export function processingStage(step: string | undefined, percent: number): ProcessingStage {
  const fromStep = step ? BY_STEP.get(step) : undefined;
  // probe is the step until the task reports; once a percent arrives it decides instead.
  if (fromStep && fromStep !== 'starting') return fromStep;
  if (percent <= 0) return fromStep ?? 'queued';
  return percent < 25 ? 'preparing' : percent < 90 ? 'transcoding' : 'finalizing';
}

/** The percent shown, a whole number from 0 to 100. */
export function processingPercent(value: number | undefined): number {
  return Math.min(100, Math.max(0, Math.round(value ?? 0)));
}
