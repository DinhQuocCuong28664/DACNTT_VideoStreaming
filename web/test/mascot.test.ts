// @vitest-environment node
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MASCOTS, pickMascot } from '../src/components/Common/StatusScreen';

describe('status screen mascots', () => {
  it('has both sprite sheets for every mascot', () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed folder of this repository
    const files = new Set(readdirSync(join(import.meta.dirname, '../public/mascots')));
    for (const m of MASCOTS) {
      expect(files.has(`${m}-directions.webp`), `${m}-directions`).toBe(true);
      expect(files.has(`${m}-reactions.webp`), `${m}-reactions`).toBe(true);
    }
  });

  it('picks every mascot across the range of random numbers', () => {
    expect(pickMascot(() => 0)).toBe(MASCOTS[0]);
    expect(pickMascot(() => 0.9999)).toBe(MASCOTS.at(-1));
    const seen = new Set(Array.from({ length: MASCOTS.length }, (_, i) => pickMascot(() => (i + 0.5) / MASCOTS.length)));
    expect(seen.size).toBe(MASCOTS.length);
  });
});
