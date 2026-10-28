/**
 * Joins the per-chunk playlists of the chunked path into one media playlist per rung, after
 * checking that the chunks really match the plan. A video is never published from chunks
 * that would play with gaps, duplicated frames or broken quality switches.
 */
import type { ChunkPlan } from '../media/chunkPlan.js';
import { frameSeconds } from '../media/rational.js';
import type { MeasuredSegment } from './playlist.js';

/** What one chunk job reports for one rung: its segments in order, with sizes. */
export interface ChunkRungResult {
  segments: MeasuredSegment[];
}

/** What one chunk job writes when it has uploaded all its segments. */
export interface ChunkResult {
  index: number;
  rungs: Record<string, ChunkRungResult>;
}

export interface StitchIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface StitchResult {
  /** Segments per rung in playback order. */
  rungs: Map<string, MeasuredSegment[]>;
  issues: StitchIssue[];
}

/** Drift below half a frame is rounding; three frames or more means the chunk is wrong. */
const WARN_FRAMES = 0.5;
const ERROR_FRAMES = 3;

const sum = (segments: readonly MeasuredSegment[]): number => segments.reduce((t, s) => t + s.duration, 0);

/**
 * Validates every chunk against the plan and joins the rungs. Errors make `issues` contain at
 * least one entry with level "error"; callers must not publish in that case.
 */
export function stitchChunks(plan: ChunkPlan, rungNames: readonly string[], results: readonly ChunkResult[]): StitchResult {
  const issues: StitchIssue[] = [];
  const byIndex = new Map(results.map((r) => [r.index, r]));
  const frame = frameSeconds(plan.fps);
  const rungs = new Map<string, MeasuredSegment[]>(rungNames.map((name) => [name, []]));
  const lastIndex = plan.chunks.length - 1;

  for (const r of results) {
    if (r.index < 0 || r.index > lastIndex) issues.push({ level: 'error', message: `chunk ${r.index} is outside the plan` });
  }

  for (const chunk of plan.chunks) {
    const result = byIndex.get(chunk.index);
    if (!result) {
      issues.push({ level: 'error', message: `chunk ${chunk.index} has no result` });
      continue;
    }
    const isLast = chunk.index === lastIndex;

    // Every rung must cut segments at the same times (RFC 8216 §6.2.4), or switching breaks.
    const reported = new Map(Object.entries(result.rungs));
    const reference = rungNames.map((name) => reported.get(name)?.segments ?? null);
    const first = reference.at(0);
    if (reference.some((s) => s === null) || !first) {
      issues.push({ level: 'error', message: `chunk ${chunk.index} is missing a rung` });
      continue;
    }
    const durations = first.map((s) => s.duration.toFixed(3)).join(',');
    if (reference.some((s) => s!.map((x) => x.duration.toFixed(3)).join(',') !== durations)) {
      issues.push({ level: 'error', message: `chunk ${chunk.index}: rungs have different segment boundaries` });
    }

    if (first.length === 0) {
      // An estimate can leave the open-ended last chunk empty; a middle chunk never may.
      if (!isLast) issues.push({ level: 'error', message: `chunk ${chunk.index} produced no segments` });
      continue;
    }

    if (!isLast && chunk.expectedSeconds !== null) {
      const driftFrames = Math.abs(sum(first) - chunk.expectedSeconds) / frame;
      if (driftFrames >= ERROR_FRAMES) {
        issues.push({ level: 'error', message: `chunk ${chunk.index} is ${driftFrames.toFixed(1)} frames off its plan` });
      } else if (driftFrames >= WARN_FRAMES) {
        issues.push({ level: 'warning', message: `chunk ${chunk.index} is ${driftFrames.toFixed(1)} frames off its plan` });
      }
    }

    rungNames.forEach((name, i) => {
      rungs.get(name)!.push(...reference.at(i)!);
    });
  }

  return { rungs, issues };
}

export const hasErrors = (issues: readonly StitchIssue[]): boolean => issues.some((i) => i.level === 'error');
