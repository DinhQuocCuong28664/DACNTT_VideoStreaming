import { describe, expect, it } from 'vitest';
import { ageOn, isOldEnough } from '../src/lib/age';

const today = new Date(Date.UTC(2026, 10, 12));

describe('age check', () => {
  it('counts full years and respects the birthday', () => {
    expect(ageOn('2014-11-12', today)).toBe(12);
    expect(ageOn('2014-11-13', today)).toBe(11);
    expect(ageOn('2000-01-01', today)).toBe(26);
  });

  it('rejects missing, malformed, impossible and future dates', () => {
    expect(ageOn('', today)).toBeNull();
    expect(ageOn('12/11/2010', today)).toBeNull();
    expect(ageOn('2010-02-30', today)).toBeNull();
    expect(ageOn('2030-01-01', today)).toBeNull();
  });

  it('allows exactly the minimum age and blocks younger users', () => {
    expect(isOldEnough('2014-11-12', today)).toBe(true);
    expect(isOldEnough('2014-11-13', today)).toBe(false);
    expect(isOldEnough('', today)).toBe(false);
  });
});
