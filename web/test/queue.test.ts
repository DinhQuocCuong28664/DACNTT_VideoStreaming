import { describe, expect, it } from 'vitest';
import { nextInQueue, queuePosition, shuffleOrder } from '../src/lib/queue';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('playlist queue', () => {
  it('shuffles every video once, with the current one first', () => {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const order = shuffleOrder(ids, 'c', random);
    expect(order[0]).toBe('c');
    expect([...order].sort()).toEqual(ids);
    expect(shuffleOrder(ids, 'z', random).sort()).toEqual(ids);
  });

  it('moves to the next video, stops at the end and starts again when looping', () => {
    expect(nextInQueue(ids, 'b', false)).toBe('c');
    expect(nextInQueue(ids, 'e', false)).toBeNull();
    expect(nextInQueue(ids, 'e', true)).toBe('a');
    expect(nextInQueue(['a'], 'a', true)).toBeNull();
    expect(nextInQueue(ids, 'x', false)).toBe('a');
    expect(nextInQueue([], 'a', true)).toBeNull();
  });

  it('tells where the video is in the order', () => {
    expect(queuePosition(ids, 'd')).toEqual({ index: 4, total: 5 });
    expect(queuePosition(ids, 'x')).toBeNull();
  });
});
