import { describe, expect, it } from 'vitest';
import { effectiveSetting, envFlag } from '../src/settings.js';

describe('runtime switches', () => {
  it('reads only exact true and false from the environment', () => {
    expect(envFlag('true', false)).toBe(true);
    expect(envFlag('false', true)).toBe(false);
    expect(envFlag(undefined, true)).toBe(true);
    expect(envFlag('TRUE', false)).toBe(false);
    expect(envFlag('0', true)).toBe(true);
  });

  it('lets a stored switch override the default of the infrastructure', () => {
    expect(effectiveSetting(false, true)).toBe(false);
    expect(effectiveSetting(true, false)).toBe(true);
    expect(effectiveSetting(undefined, false)).toBe(false);
    expect(effectiveSetting(null, true)).toBe(true);
  });
});
