import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStartTime, withStartTime } from './startTime.js';

test('parseStartTime reads plain seconds', () => {
  assert.equal(parseStartTime('90'), 90);
  assert.equal(parseStartTime('0'), 0);
  assert.equal(parseStartTime(' 42 '), 42);
});

test('parseStartTime reads YouTube-style units', () => {
  assert.equal(parseStartTime('90s'), 90);
  assert.equal(parseStartTime('2m'), 120);
  assert.equal(parseStartTime('1m30s'), 90);
  assert.equal(parseStartTime('1h2m3s'), 3723);
  assert.equal(parseStartTime('1H'), 3600);
});

test('parseStartTime rejects missing or malformed values', () => {
  for (const value of [null, undefined, '', 'abc', '-5', '1.5', '1:30', '30s1m', 'm']) {
    assert.equal(parseStartTime(value), null, `value ${JSON.stringify(value)}`);
  }
});

test('withStartTime adds whole seconds to the link', () => {
  assert.equal(withStartTime('https://example.test/watch/abc', 75.9), 'https://example.test/watch/abc?t=75');
});

test('withStartTime replaces an existing t and drops it at zero', () => {
  assert.equal(withStartTime('https://example.test/watch/abc?t=10', 20), 'https://example.test/watch/abc?t=20');
  assert.equal(withStartTime('https://example.test/watch/abc?t=10', 0), 'https://example.test/watch/abc');
  assert.equal(withStartTime('https://example.test/watch/abc', 0.4), 'https://example.test/watch/abc');
});
