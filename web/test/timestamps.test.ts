import { describe, expect, it } from 'vitest';
import { splitTimestamps } from '../src/lib/timestamps';

describe('comment timestamps', () => {
  it('turns m:ss and h:mm:ss into seconds and keeps the text around them', () => {
    expect(splitTimestamps('best part at 1:23 and 1:02:03!', 4000)).toEqual([
      { kind: 'text', text: 'best part at ' },
      { kind: 'time', text: '1:23', seconds: 83 },
      { kind: 'text', text: ' and ' },
      { kind: 'time', text: '1:02:03', seconds: 3723 },
      { kind: 'text', text: '!' },
    ]);
  });

  it('leaves times past the end of the video as text', () => {
    expect(splitTimestamps('see 9:59', 120)).toEqual([{ kind: 'text', text: 'see 9:59' }]);
    expect(splitTimestamps('see 1:59', 120)).toEqual([{ kind: 'text', text: 'see ' }, { kind: 'time', text: '1:59', seconds: 119 }]);
  });

  it('ignores things that only look like times', () => {
    for (const body of ['12:345', '1:2:3:4', '1:5:00', '7:60', 'ratio 16:9', 'no times here']) {
      expect(splitTimestamps(body, 10_000).every((p) => p.kind === 'text')).toBe(true);
    }
  });

  it('accepts any time when the duration is unknown', () => {
    expect(splitTimestamps('0:05', null)).toEqual([{ kind: 'time', text: '0:05', seconds: 5 }]);
  });
});
