/**
 * Keyboard shortcuts of the player, as on YouTube. They work anywhere on the page except while the
 * viewer types in a field, so the player does not need focus first.
 */
export type ShortcutAction =
  | { kind: 'togglePlay' }
  | { kind: 'seekBy'; seconds: number }
  | { kind: 'seekToFraction'; fraction: number }
  | { kind: 'seekToStart' }
  | { kind: 'seekToEnd' }
  | { kind: 'volumeBy'; delta: number }
  | { kind: 'toggleMute' }
  | { kind: 'toggleFullscreen' }
  | { kind: 'toggleCaptions' }
  | { kind: 'frameStep'; dir: 1 | -1 }
  | { kind: 'rateStep'; dir: 1 | -1 }
  | { kind: 'chapter'; dir: 1 | -1 }
  | { kind: 'help' };

export interface KeyInput { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }

export const SHORT_SEEK_SEC = 5;
export const LONG_SEEK_SEC = 10;
export const VOLUME_STEP = 0.05;

/** The action of a key press, or null when the player leaves the key alone. */
export function shortcutFor({ key, ctrlKey = false, altKey = false, metaKey = false }: KeyInput): ShortcutAction | null {
  if (altKey || metaKey) return null;
  if (ctrlKey) {
    if (key === 'ArrowLeft') return { kind: 'chapter', dir: -1 };
    if (key === 'ArrowRight') return { kind: 'chapter', dir: 1 };
    return null;
  }
  if (/^[0-9]$/.test(key)) return { kind: 'seekToFraction', fraction: Number(key) / 10 };
  switch (key.length === 1 ? key.toLowerCase() : key) {
    case ' ': case 'k': return { kind: 'togglePlay' };
    case 'ArrowLeft': return { kind: 'seekBy', seconds: -SHORT_SEEK_SEC };
    case 'ArrowRight': return { kind: 'seekBy', seconds: SHORT_SEEK_SEC };
    case 'j': return { kind: 'seekBy', seconds: -LONG_SEEK_SEC };
    case 'l': return { kind: 'seekBy', seconds: LONG_SEEK_SEC };
    case 'ArrowUp': return { kind: 'volumeBy', delta: VOLUME_STEP };
    case 'ArrowDown': return { kind: 'volumeBy', delta: -VOLUME_STEP };
    case 'm': return { kind: 'toggleMute' };
    case 'f': return { kind: 'toggleFullscreen' };
    case 'c': return { kind: 'toggleCaptions' };
    case 'Home': return { kind: 'seekToStart' };
    case 'End': return { kind: 'seekToEnd' };
    case ',': return { kind: 'frameStep', dir: -1 };
    case '.': return { kind: 'frameStep', dir: 1 };
    case '<': return { kind: 'rateStep', dir: -1 };
    case '>': return { kind: 'rateStep', dir: 1 };
    case '?': return { kind: 'help' };
    default: return null;
  }
}

interface TargetLike { tagName?: string; type?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null }

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'password', 'url', 'tel', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);

/** True when the key belongs to the focused element: typing in a field, a slider's arrows, or activating a button. */
export function keyBelongsToTarget(target: TargetLike | null, key: string): boolean {
  if (!target?.tagName) return false;
  const tag = target.tagName.toLowerCase();
  if (target.isContentEditable || tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = (target.type ?? '').toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) return true;
    if (type === 'range') return key.startsWith('Arrow') || key === 'Home' || key === 'End';
    return key === ' ' || key === 'Enter';
  }
  const role = target.getAttribute?.('role') ?? '';
  const activatable = tag === 'button' || tag === 'a' || role === 'button' || role.startsWith('menuitem');
  return activatable && (key === ' ' || key === 'Enter');
}

/** Next playback rate in the list, or the same one at either end. */
export function stepRate(rates: readonly number[], current: number, dir: 1 | -1): number {
  const i = rates.indexOf(current);
  const from = i === -1 ? rates.indexOf(1) : i;
  return rates[Math.min(Math.max(from + dir, 0), rates.length - 1)] ?? current;
}

/** Start of the chapter before or after `time`; going back from inside a chapter (> 3 s in) restarts it. */
export function chapterTarget(chapters: readonly { startSec: number }[], time: number, dir: 1 | -1): number | null {
  const starts = chapters.map((c) => c.startSec).sort((a, b) => a - b);
  if (starts.length === 0) return null;
  if (dir > 0) return starts.find((s) => s > time + 0.5) ?? null;
  const before = starts.filter((s) => s <= time);
  const current = before.at(-1);
  if (current === undefined) return null;
  return time - current > 3 ? current : (before.at(-2) ?? 0);
}
