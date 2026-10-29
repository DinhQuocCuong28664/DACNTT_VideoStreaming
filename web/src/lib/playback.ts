/** Pure helpers of the player: the 30-second view rule, ?t= links, signed CDN URLs, sprite cues. */

export const VIEW_SECONDS = 30;
/** A timeupdate step longer than this is a seek or a stall, not playback. */
const MAX_PLAYBACK_STEP = 1.5;
const END_TOLERANCE = 0.5;

/**
 * Seconds of playback a view needs: 30, or the whole video minus a little, because the
 * moment before the first timeupdate is never counted (a 30.1 s video would otherwise
 * never reach 30).
 */
export function viewThreshold(duration: number, seconds = VIEW_SECONDS): number {
  if (!Number.isFinite(duration) || duration <= 0) return seconds;
  return Math.max(0, Math.min(seconds, duration - END_TOLERANCE));
}

/** Adds the time that passed while playing; seeks and stalls add nothing. */
export function addWatched(watched: number, lastTime: number | null, time: number, playing: boolean): number {
  if (!playing || lastTime === null) return watched;
  const step = time - lastTime;
  return step <= 0 || step > MAX_PLAYBACK_STEP ? watched : watched + step;
}

export const reachedView = (watched: number, duration: number, seconds = VIEW_SECONDS) => watched >= viewThreshold(duration, seconds);

/** Reads ?t= as seconds: "90", "1m30s", "1h2m3s". */
export function parseStartTime(raw: string | null | undefined): number | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return null;
  if (/^\d+$/.test(value)) return Number(value);
  // Units in the order h, m, s, each at most once: "1h2m3s", "90s", "2m".
  const order = ['h', 'm', 's'];
  let total = 0;
  let last = -1;
  let rest = value;
  while (rest) {
    const digits = /^\d+/.exec(rest)?.[0];
    const unit = digits ? rest.charAt(digits.length) : '';
    const index = order.indexOf(unit);
    if (!digits || index <= last) return null;
    total += Number(digits) * (60 ** (2 - index));
    last = index;
    rest = rest.slice(digits.length + 1);
  }
  return total;
}

export function withStartTime(url: string, seconds: number): string {
  const whole = Math.floor(seconds || 0);
  const u = new URL(url);
  if (whole > 0) u.searchParams.set('t', String(whole));
  else u.searchParams.delete('t');
  return u.toString();
}

/** Appends the CloudFront policy parameters to a URL of the CDN host only. */
export function signUrl(url: string, cdnOrigin: string, query: Record<string, string>): string {
  const u = new URL(url);
  if (u.origin !== cdnOrigin) return url;
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

export interface SpriteCue { start: number; end: number; url: string; x: number; y: number; w: number; h: number }

const stamp = (s: string): number => {
  const parts = s.trim().split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
};

/** Parses the seek-preview thumbnails.vtt (cues pointing at sprite.jpg#xywh=x,y,w,h). */
export function parseSpriteVtt(text: string, baseUrl: string): SpriteCue[] {
  const cues: SpriteCue[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines.at(i) ?? '';
    if (!line.includes('-->')) continue;
    const [a = '', b = ''] = line.split('-->');
    const target = (lines.at(i + 1) ?? '').trim();
    const hash = target.indexOf('#xywh=');
    if (hash < 0) continue;
    const [x = 0, y = 0, w = 0, h = 0] = target.slice(hash + 6).split(',').map(Number);
    cues.push({ start: stamp(a), end: stamp(b.trim().split(/\s/)[0] ?? ''), url: new URL(target.slice(0, hash), baseUrl).toString(), x, y, w, h });
  }
  return cues;
}

export const cueAt = (cues: readonly SpriteCue[], t: number): SpriteCue | undefined => cues.find((c) => t >= c.start && t < c.end);

/**
 * YouTube-style quality name from the frame size: the larger of the short side and
 * long side x 9/16, so a portrait 1080x1920 and a 1920x800 film both read 1080p.
 */
export function qualityLabel(width: number, height: number): string {
  const h = width > 0 && height > 0 ? Math.max(Math.min(width, height), Math.round((Math.max(width, height) * 9) / 16)) : height;
  for (const step of [2160, 1440, 1080, 720, 480, 360, 240]) if (h >= step) return `${step}p`;
  return `${h}p`;
}
