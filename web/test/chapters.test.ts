import { describe, expect, it } from 'vitest';
import { parseChapters } from '../src/lib/chapters';

describe('parseChapters', () => {
  it('reads m:ss and h:mm:ss lines and skips blank ones', () => {
    expect(parseChapters('0:00 Intro\n\n1:30 Setup\n1:02:03 Long part  ')).toEqual([
      { startSec: 0, title: 'Intro' },
      { startSec: 90, title: 'Setup' },
      { startSec: 3723, title: 'Long part' },
    ]);
  });

  it('returns an empty list for empty text', () => {
    expect(parseChapters('  \n ')).toEqual([]);
  });

  it('rejects a line without a time or a title', () => {
    expect(parseChapters('Intro')).toBeNull();
    expect(parseChapters('0:00')).toBeNull();
    expect(parseChapters('1:xx Part')).toBeNull();
    expect(parseChapters('90 Part')).toBeNull();
    expect(parseChapters('-1:00 Part')).toBeNull();
  });
});
