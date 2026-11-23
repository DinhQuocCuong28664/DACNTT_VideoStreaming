/**
 * Finds times such as "1:23" or "1:02:03" in comment text, so the watch page can turn them into
 * links that seek the player. A time past the end of the video stays plain text.
 */
export type TextPart = { kind: 'text'; text: string } | { kind: 'time'; text: string; seconds: number };

// A run of digits and colons; whether it is a time is decided by toSeconds, not by the pattern.
const RUN = /\d[\d:]*\d/g;

/** m:ss or h:mm:ss with minutes and seconds below 60; anything else ("12:345", "16:9") is not a time. */
function toSeconds(text: string): number | null {
  const parts = text.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const [first = '', ...rest] = parts;
  if (first.length > 2 || rest.some((p) => p.length !== 2) || (rest.length === 2 && first.length === 0)) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60) || (parts.length === 3 && (nums[1] ?? 0) >= 60)) return null;
  return nums.reduce((total, n) => total * 60 + n, 0);
}

export function splitTimestamps(body: string, durationSec: number | null | undefined): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of body.matchAll(RUN)) {
    const [text] = m;
    const seconds = toSeconds(text);
    if (seconds === null) continue;
    if (durationSec && seconds > durationSec) continue;
    const start = m.index;
    if (start > at) parts.push({ kind: 'text', text: body.slice(at, start) });
    parts.push({ kind: 'time', text, seconds });
    at = start + text.length;
  }
  if (at < body.length) parts.push({ kind: 'text', text: body.slice(at) });
  return parts;
}
