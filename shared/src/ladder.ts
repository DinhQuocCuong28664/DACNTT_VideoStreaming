/**
 * Six-rung Capped-CRF ladder and the rule that fits it to a source.
 *
 * A rung is named by the short side of its frame, so a portrait 720p rung is
 * 720x1280. Rungs are never larger than the source: the first rung at or above
 * the source short side is kept at the source size with its own settings.
 */
export interface Rung {
  name: string;
  /** Short side of the frame in pixels. */
  shortSide: number;
  crf: number;
  /** Video bitrate cap in kbit/s (VBV maxrate). */
  maxrateKbps: number;
  /** VBV buffer in kbit (two seconds of maxrate). */
  bufsizeKbit: number;
  audioKbps: number;
}

export const LADDER: readonly Rung[] = [
  { name: '144p', shortSide: 144, crf: 28, maxrateKbps: 180, bufsizeKbit: 360, audioKbps: 64 },
  { name: '240p', shortSide: 240, crf: 26, maxrateKbps: 350, bufsizeKbit: 700, audioKbps: 64 },
  { name: '360p', shortSide: 360, crf: 25, maxrateKbps: 600, bufsizeKbit: 1200, audioKbps: 64 },
  { name: '480p', shortSide: 480, crf: 24, maxrateKbps: 1100, bufsizeKbit: 2200, audioKbps: 64 },
  { name: '720p', shortSide: 720, crf: 23, maxrateKbps: 2200, bufsizeKbit: 4400, audioKbps: 128 },
  { name: '1080p', shortSide: 1080, crf: 22, maxrateKbps: 4500, bufsizeKbit: 9000, audioKbps: 128 },
];

/** Rungs kept for long videos on the single-job path. */
export const LONG_VIDEO_RUNGS: readonly string[] = ['360p', '720p', '1080p'];

export const DEFAULT_LONG_VIDEO_THRESHOLD_SEC = 20 * 60;

export interface PlannedRendition extends Rung {
  width: number;
  height: number;
}

export interface PlanInput {
  /** Display width after rotation and sample aspect ratio, if known. */
  width?: number | undefined;
  /** Display height after rotation and sample aspect ratio, if known. */
  height?: number | undefined;
  /** Duration in seconds; 0, NaN or undefined means unknown. */
  durationSec?: number | undefined;
  /** The chunked path always gets the full ladder. */
  chunked?: boolean;
  longVideoThresholdSec?: number;
}

const toEven = (value: number): number => Math.max(2, Math.round(value / 2) * 2);

function selectRungs(input: PlanInput): readonly Rung[] {
  if (input.chunked) return LADDER;
  const threshold = input.longVideoThresholdSec ?? DEFAULT_LONG_VIDEO_THRESHOLD_SEC;
  const duration = input.durationSec;
  const known = typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
  // Unknown duration takes the cheap ladder: the video may be hours long.
  if (!known || duration > threshold) return LADDER.filter((r) => LONG_VIDEO_RUNGS.includes(r.name));
  return LADDER;
}

/**
 * Fits the ladder to the source. Without a known frame size the configured
 * 16:9 landscape frames are returned unchanged.
 */
export function planRenditions(input: PlanInput): PlannedRendition[] {
  const rungs = selectRungs(input);
  const { width, height } = input;
  if (!width || !height || width <= 0 || height <= 0) {
    return rungs.map((r) => ({ ...r, width: toEven((r.shortSide * 16) / 9), height: r.shortSide }));
  }

  const portrait = height > width;
  const sourceShort = Math.min(width, height);
  const sourceLong = Math.max(width, height);
  const frame = (short: number): { width: number; height: number } => {
    const long = toEven((short * sourceLong) / sourceShort);
    const s = toEven(short);
    return portrait ? { width: s, height: long } : { width: long, height: s };
  };

  const planned: PlannedRendition[] = [];
  for (const rung of rungs) {
    if (rung.shortSide < sourceShort) {
      planned.push({ ...rung, ...frame(rung.shortSide) });
      continue;
    }
    // First rung at or above the source: keep it at the source size, then stop.
    planned.push({ ...rung, ...frame(sourceShort) });
    break;
  }
  return planned;
}

/** Audio bitrates actually needed by a plan, ascending, without duplicates. */
export function audioBitrates(plan: readonly PlannedRendition[]): number[] {
  return [...new Set(plan.map((r) => r.audioKbps))].sort((a, b) => a - b);
}
