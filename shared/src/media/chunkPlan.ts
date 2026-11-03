/**
 * Splits a long CFR source into chunks of whole GOPs that can be encoded in parallel and
 * joined without gaps, duplicated frames or audio drift.
 *
 * Invariants (measured on v1, see docs/ARCHITECTURE.md §5.4):
 * - a chunk is a whole number of segment-length GOPs, so every rung cuts segments at the
 *   same frames and ABR switches stay clean;
 * - chunk k's video window ends exactly where chunk k+1 begins; the seek starts half a frame
 *   before the first frame so -ss never lands on the previous frame or skips the first one;
 * - chunk 0 never seeks negative and uses the same offset formula as every other chunk;
 * - audio windows start exactly at the first frame and meet to the microsecond;
 * - the last chunk is open-ended (no -t) so it reads to the end even if the frame estimate is
 *   slightly off; a remainder shorter than one GOP joins the previous chunk.
 */
import { frameSeconds, gopFrames, microseconds, type Rational } from './rational.js';

export interface Chunk {
  index: number;
  startFrame: number;
  /** Frames in the chunk; null for the open-ended last chunk. */
  frames: number | null;
  seekSeconds: number;
  durationSeconds: number | null;
  audioSeekSeconds: number;
  audioDurationSeconds: number | null;
  /** Output timestamp offset so every chunk lands at its place on one timeline. */
  tsOffsetSeconds: number;
  expectedSegments: number | null;
  expectedSeconds: number | null;
}

export interface ChunkPlan {
  fps: Rational;
  gopFrames: number;
  gopSeconds: number;
  segmentSeconds: number;
  gopsPerChunk: number;
  chunkFrames: number;
  chunkSeconds: number;
  frameCount: number;
  chunks: Chunk[];
}

/** Array jobs accept 2 to 10 000 children. */
export const MAX_ARRAY_SIZE = 10_000;

export interface GopsPerChunkInput {
  frameCount: number;
  fps: Rational;
  segmentSeconds?: number;
  /** Upper bound: 50 GOPs = 5 minutes at 6 s segments. */
  maxGops?: number;
  /** Lower bound so short videos do not explode into tiny chunks. */
  minGops?: number;
  /** About three chunks per available slot; 0 or 1 keeps the upper bound. */
  targetChunks?: number;
}

/** Chunk length that spreads the work over the available slots, within [minGops, maxGops]. */
export function chooseGopsPerChunk(input: GopsPerChunkInput): number {
  const { frameCount, fps, segmentSeconds = 6, maxGops = 50, minGops = 10, targetChunks = 0 } = input;
  const ceiling = Math.max(1, Math.floor(maxGops));
  if (!(targetChunks >= 2) || !(frameCount > 0)) return ceiling;
  const floor = Math.min(ceiling, Math.max(1, Math.floor(minGops)));
  const totalGops = Math.max(1, Math.floor(frameCount / gopFrames(fps, segmentSeconds)));
  return Math.min(ceiling, Math.max(floor, Math.ceil(totalGops / Math.floor(targetChunks))));
}

export interface ChunkPlanInput {
  frameCount: number;
  fps: Rational;
  /** Start of the video stream relative to the file start (MPEG-TS files often start > 0). */
  videoStartOffset?: number;
  segmentSeconds?: number;
  gopsPerChunk: number;
  /** Shift every chunk by this many seconds so no timestamp is negative after -ss. */
  tsOffsetBase?: number;
}

export function buildChunkPlan(input: ChunkPlanInput): ChunkPlan {
  const { frameCount, fps, videoStartOffset = 0, segmentSeconds = 6, gopsPerChunk, tsOffsetBase = 1 } = input;
  if (!(frameCount > 0)) throw new Error('buildChunkPlan: frameCount must be positive');
  if (!Number.isInteger(gopsPerChunk) || gopsPerChunk < 1) {
    throw new Error('buildChunkPlan: gopsPerChunk must be a positive integer');
  }

  const d = frameSeconds(fps);
  const gop = gopFrames(fps, segmentSeconds);
  const chunkFrames = gop * gopsPerChunk;

  let count = Math.ceil(frameCount / chunkFrames);
  const remainder = frameCount - (count - 1) * chunkFrames;
  if (count > 1 && remainder < gop) count -= 1;
  if (count > MAX_ARRAY_SIZE) throw new Error(`buildChunkPlan: ${count} chunks exceed the array job limit`);

  const chunks: Chunk[] = [];
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const startFrame = index * chunkFrames;
    const firstFrameAt = videoStartOffset + startFrame * d;
    const windowStart = firstFrameAt - 0.5 * d;
    const seek = Math.max(0, windowStart);

    chunks.push({
      index,
      startFrame,
      frames: isLast ? null : chunkFrames,
      seekSeconds: microseconds(seek),
      durationSeconds: isLast ? null : microseconds(windowStart + chunkFrames * d - seek),
      audioSeekSeconds: microseconds(firstFrameAt),
      audioDurationSeconds: null,
      tsOffsetSeconds: microseconds(firstFrameAt + tsOffsetBase),
      expectedSegments: isLast ? null : gopsPerChunk,
      expectedSeconds: isLast ? null : microseconds(chunkFrames * d),
    });
  }
  chunks.forEach((current, k) => {
    const next = chunks.at(k + 1);
    if (next) current.audioDurationSeconds = microseconds(next.audioSeekSeconds - current.audioSeekSeconds);
  });

  return {
    fps,
    gopFrames: gop,
    gopSeconds: microseconds(gop * d),
    segmentSeconds,
    gopsPerChunk,
    chunkFrames,
    chunkSeconds: microseconds(chunkFrames * d),
    frameCount,
    chunks,
  };
}
