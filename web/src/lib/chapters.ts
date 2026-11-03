/** Reads "m:ss Title" or "h:mm:ss Title" lines; returns null for a line it cannot read. */
export function parseChapters(text: string): { startSec: number; title: string }[] | null {
  const out: { startSec: number; title: string }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const space = line.indexOf(' ');
    if (space < 0) return null;
    const parts = line.slice(0, space).split(':');
    const title = line.slice(space + 1).trim();
    if (parts.length < 2 || parts.length > 3 || !title) return null;
    let sec = 0;
    for (const p of parts) {
      const n = Number(p);
      if (!p || !Number.isInteger(n) || n < 0) return null;
      sec = sec * 60 + n;
    }
    out.push({ startSec: sec, title });
  }
  return out;
}
