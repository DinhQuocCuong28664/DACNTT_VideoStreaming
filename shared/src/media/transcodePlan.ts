/**
 * The decision the probe step hands to the workflow: which path, which rungs, which audio
 * bitrates and, for long videos, the chunk plan.
 */
import { audioBitrates, planRenditions, type PlannedRendition } from '../ladder.js';
import { buildChunkPlan, chooseGopsPerChunk, type ChunkPlan } from './chunkPlan.js';
import { chunkEligibility, durationSeconds, estimateFrameCount, type ProbeSummary } from './probe.js';

/** Sources at least this long take the chunked path (v1 measurement: 5 min went 26.7 → 11.9 min). */
export const DEFAULT_CHUNK_THRESHOLD_SEC = 300;

export const SEGMENT_SECONDS = 6;

export interface TranscodePlanOptions {
  chunkThresholdSec?: number;
  /** Chunk slots available at once (vCPU ceiling / chunk vCPU); used to size chunks. */
  parallelSlots?: number;
}

export interface SinglePlan {
  mode: 'single';
  /** Why the chunked path was not taken, when the source was long enough for it. */
  fallbackReason: string | null;
  durationSec: number | null;
  renditions: PlannedRendition[];
  audioBitratesKbps: number[];
  hasAudio: boolean;
  videoStreamIndex: number;
  audioStreamIndex: number | null;
}

export interface ChunkedPlan {
  mode: 'chunked';
  durationSec: number;
  renditions: PlannedRendition[];
  audioBitratesKbps: number[];
  hasAudio: boolean;
  videoStreamIndex: number;
  audioStreamIndex: number | null;
  chunkPlan: ChunkPlan;
}

export type TranscodePlan = SinglePlan | ChunkedPlan;

export function buildTranscodePlan(summary: ProbeSummary, options: TranscodePlanOptions = {}): TranscodePlan {
  const threshold = options.chunkThresholdSec ?? DEFAULT_CHUNK_THRESHOLD_SEC;
  const video = summary.video;
  if (!video) throw new Error('the source has no video stream');

  const duration = durationSeconds(summary);
  const hasAudio = summary.audio !== null;
  const common = {
    hasAudio,
    videoStreamIndex: video.index,
    audioStreamIndex: summary.audio?.index ?? null,
  };

  const single = (fallbackReason: string | null): SinglePlan => {
    const renditions = planRenditions({ width: video.width, height: video.height, durationSec: duration ?? undefined });
    return {
      mode: 'single',
      fallbackReason,
      durationSec: duration,
      renditions,
      audioBitratesKbps: hasAudio ? audioBitrates(renditions) : [],
      ...common,
    };
  };

  if (duration === null || duration < threshold) return single(duration === null ? 'unknown duration' : null);

  const eligibility = chunkEligibility(summary);
  if (!eligibility.ok) return single(eligibility.reason);

  const fps = video.fps!;
  const frameCount = estimateFrameCount(summary);
  const slots = Math.max(0, Math.floor(options.parallelSlots ?? 0));
  const gopsPerChunk = chooseGopsPerChunk({
    frameCount,
    fps,
    segmentSeconds: SEGMENT_SECONDS,
    targetChunks: slots >= 1 ? slots * 3 : 0,
  });
  const chunkPlan = buildChunkPlan({
    frameCount,
    fps,
    videoStartOffset: Math.max(0, (video.start ?? 0) - summary.formatStart),
    segmentSeconds: SEGMENT_SECONDS,
    gopsPerChunk,
  });
  // An array job needs at least two children.
  if (chunkPlan.chunks.length < 2) return single('fewer than two chunks');

  const renditions = planRenditions({ width: video.width, height: video.height, durationSec: duration, chunked: true });
  return {
    mode: 'chunked',
    durationSec: duration,
    renditions,
    audioBitratesKbps: hasAudio ? audioBitrates(renditions) : [],
    chunkPlan,
    ...common,
  };
}
