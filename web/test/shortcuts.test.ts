import { describe, expect, it } from 'vitest';
import { chapterTarget, keyBelongsToTarget, shortcutFor, stepRate } from '../src/lib/shortcuts';

const el = (tagName: string, extra: { type?: string; role?: string; isContentEditable?: boolean } = {}) => ({
  tagName, type: extra.type, isContentEditable: extra.isContentEditable ?? false,
  getAttribute: (name: string) => (name === 'role' ? (extra.role ?? null) : null),
});

describe('player shortcuts', () => {
  it('maps the YouTube keys', () => {
    expect(shortcutFor({ key: ' ' })).toEqual({ kind: 'togglePlay' });
    expect(shortcutFor({ key: 'K' })).toEqual({ kind: 'togglePlay' });
    expect(shortcutFor({ key: 'ArrowRight' })).toEqual({ kind: 'seekBy', seconds: 5 });
    expect(shortcutFor({ key: 'j' })).toEqual({ kind: 'seekBy', seconds: -10 });
    expect(shortcutFor({ key: 'l' })).toEqual({ kind: 'seekBy', seconds: 10 });
    expect(shortcutFor({ key: 'ArrowDown' })).toEqual({ kind: 'volumeBy', delta: -0.05 });
    expect(shortcutFor({ key: '7' })).toEqual({ kind: 'seekToFraction', fraction: 0.7 });
    expect(shortcutFor({ key: '>' })).toEqual({ kind: 'rateStep', dir: 1 });
    expect(shortcutFor({ key: ',' })).toEqual({ kind: 'frameStep', dir: -1 });
    expect(shortcutFor({ key: '?' })).toEqual({ kind: 'help' });
    expect(shortcutFor({ key: 'T' })).toEqual({ kind: 'toggleTheater' });
    expect(shortcutFor({ key: 'i' })).toEqual({ kind: 'miniPlayer' });
    expect(shortcutFor({ key: 'i', ctrlKey: true })).toBeNull();
  });

  it('leaves browser and system combinations alone', () => {
    expect(shortcutFor({ key: 'f', ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: 'l', metaKey: true })).toBeNull();
    expect(shortcutFor({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(shortcutFor({ key: 'ArrowLeft', ctrlKey: true })).toEqual({ kind: 'chapter', dir: -1 });
    expect(shortcutFor({ key: 'x' })).toBeNull();
  });

  it('never takes a key from a field, a slider or a focused button', () => {
    expect(keyBelongsToTarget(el('INPUT', { type: 'text' }), 'k')).toBe(true);
    expect(keyBelongsToTarget(el('TEXTAREA'), ' ')).toBe(true);
    expect(keyBelongsToTarget(el('DIV', { isContentEditable: true }), 'm')).toBe(true);
    expect(keyBelongsToTarget(el('INPUT', { type: 'range' }), 'ArrowUp')).toBe(true);
    expect(keyBelongsToTarget(el('INPUT', { type: 'range' }), 'k')).toBe(false);
    expect(keyBelongsToTarget(el('BUTTON'), ' ')).toBe(true);
    expect(keyBelongsToTarget(el('BUTTON'), 'ArrowRight')).toBe(false);
    expect(keyBelongsToTarget(el('DIV', { role: 'menuitem' }), 'Enter')).toBe(true);
    expect(keyBelongsToTarget(el('BODY'), ' ')).toBe(false);
    expect(keyBelongsToTarget(null, ' ')).toBe(false);
  });

  it('steps the speed within the list', () => {
    const rates = [0.5, 1, 1.5, 2];
    expect(stepRate(rates, 1, 1)).toBe(1.5);
    expect(stepRate(rates, 2, 1)).toBe(2);
    expect(stepRate(rates, 0.5, -1)).toBe(0.5);
    expect(stepRate(rates, 1.1, -1)).toBe(0.5);
  });

  it('finds the chapter to jump to', () => {
    const chapters = [{ startSec: 0 }, { startSec: 60 }, { startSec: 120 }];
    expect(chapterTarget(chapters, 30, 1)).toBe(60);
    expect(chapterTarget(chapters, 130, 1)).toBeNull();
    expect(chapterTarget(chapters, 70, -1)).toBe(60);
    expect(chapterTarget(chapters, 61, -1)).toBe(0);
    expect(chapterTarget([], 10, 1)).toBeNull();
  });
});
