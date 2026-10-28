/**
 * One progress number for a video whose analysis and encoding run in parallel. The status
 * function keeps a ProgressState per upload version, folds every TranscodeProgress event into
 * it, and stores `overallPercent` for the UI, so the bar never jumps between the branches.
 *
 * Weights: single path = analyse 15 % + encode 85 %; chunked path = analyse 10 % + audio 10 % +
 * chunks 80 %. Stitch takes about two seconds and gets no share; Publish sets 100 %.
 */
import type { TranscodeProgress } from './events.js';

export interface ProgressState {
  analyse: number;
  encode: number;
  audio: number;
  /** Chunk indices that have finished (chunked path only). */
  chunksDone: number[];
  /** 0 until an event of the chunked path tells how many chunks there are. */
  chunkCount: number;
}

export const emptyProgress = (chunkCount = 0): ProgressState => ({ analyse: 0, encode: 0, audio: 0, chunksDone: [], chunkCount });

/** Folds one event in. Percentages never go backwards; a repeated chunk counts once. */
export function applyProgress(state: ProgressState, event: TranscodeProgress): ProgressState {
  const next: ProgressState = { ...state, chunksDone: [...state.chunksDone] };
  // Audio and chunk events carry the chunk count, so the chunked weights apply from the start.
  if (event.parts !== undefined) next.chunkCount = event.parts;
  if (event.step === 'analyse') next.analyse = Math.max(state.analyse, event.percent);
  if (event.step === 'audio') next.audio = Math.max(state.audio ?? 0, event.percent);
  if (event.step === 'encode') {
    if (event.part !== undefined) {
      if (event.percent >= 100 && !next.chunksDone.includes(event.part)) next.chunksDone.push(event.part);
    } else {
      next.encode = Math.max(state.encode, event.percent);
    }
  }
  return next;
}

/** Weighted total, 0..99 until the workflow publishes (the last 1 % belongs to Publish). */
export function overallPercent(state: ProgressState): number {
  const total = state.chunkCount > 0
    ? 0.1 * state.analyse + 0.1 * (state.audio ?? 0) + (80 * state.chunksDone.length) / state.chunkCount
    : 0.15 * state.analyse + 0.85 * state.encode;
  return Math.min(99, Math.floor(total));
}
