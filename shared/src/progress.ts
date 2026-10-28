/**
 * One progress number for a video whose analysis and encoding run in parallel. The status
 * function keeps a ProgressState per upload version, folds every TranscodeProgress event into
 * it, and stores `overallPercent` for the UI, so the bar never jumps between the two branches.
 */
import type { TranscodeProgress } from './events.js';

export interface ProgressState {
  analyse: number;
  encode: number;
  /** Chunk indices that have finished (chunked path only). */
  chunksDone: number[];
  chunkCount: number;
  stitch: number;
}

export const emptyProgress = (chunkCount = 0): ProgressState => ({ analyse: 0, encode: 0, chunksDone: [], chunkCount, stitch: 0 });

/** Folds one event in. Percentages never go backwards; a repeated chunk counts once. */
export function applyProgress(state: ProgressState, event: TranscodeProgress): ProgressState {
  const next: ProgressState = { ...state, chunksDone: [...state.chunksDone] };
  if (event.step === 'analyse') next.analyse = Math.max(state.analyse, event.percent);
  if (event.step === 'stitch') next.stitch = Math.max(state.stitch, event.percent);
  if (event.step === 'encode') {
    if (event.part !== undefined) {
      if (event.percent >= 100 && !next.chunksDone.includes(event.part)) next.chunksDone.push(event.part);
      if (event.parts !== undefined) next.chunkCount = event.parts;
    } else {
      next.encode = Math.max(state.encode, event.percent);
    }
  }
  return next;
}

/** Weighted total, 0..99 until the workflow publishes (the last 1 % belongs to Publish). */
export function overallPercent(state: ProgressState): number {
  const chunked = state.chunkCount > 0;
  const encode = chunked ? (100 * state.chunksDone.length) / state.chunkCount : state.encode;
  const total = chunked
    ? 0.1 * state.analyse + 0.8 * encode + 0.1 * state.stitch
    : 0.15 * state.analyse + 0.85 * encode;
  return Math.min(99, Math.floor(total));
}
