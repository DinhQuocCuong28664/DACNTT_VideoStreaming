/** Frame rates and other ffprobe ratios kept as exact fractions (30000/1001, not 29.97). */
export interface Rational {
  num: number;
  den: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Reads "30000/1001", "25", 29.97 or {num, den}. Returns null for anything that is not a
 * positive ratio, so callers never divide by zero.
 */
export function parseRational(value: unknown): Rational | null {
  let num: number | undefined;
  let den: number | undefined;

  if (value && typeof value === 'object') {
    const v = value as Partial<Rational>;
    num = v.num;
    den = v.den;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Recognise NTSC rates written as decimals (29.97 = 30000/1001).
    for (const candidate of [1, 1001]) {
      const scaled = value * candidate;
      if (Math.abs(scaled - Math.round(scaled)) < 1e-6) {
        num = Math.round(scaled);
        den = candidate;
        break;
      }
    }
  } else if (typeof value === 'string') {
    const parts = value.split('/').map((p) => p.trim());
    const digits = /^\d+$/;
    if (parts.length > 2 || !parts.every((p) => digits.test(p))) return null;
    num = Number(parts[0]);
    den = parts.length === 2 ? Number(parts[1]) : 1;
  }

  if (num === undefined || den === undefined) return null;
  if (!Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0) return null;
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
}

export const toNumber = (r: Rational): number => r.num / r.den;

/** Duration of one frame in seconds. */
export const frameSeconds = (fps: Rational): number => fps.den / fps.num;

/** Frames in one segment-length GOP, rounded up, never below one. */
export function gopFrames(fps: Rational, segmentSeconds: number): number {
  return Math.max(1, Math.floor((segmentSeconds * fps.num + fps.den - 1) / fps.den));
}

/** Rounds to the microsecond so plans serialise without float noise. */
export const microseconds = (value: number): number => Math.round(value * 1e6) / 1e6;
