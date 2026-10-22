import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_SECONDS, addWatched, reachedView, viewThreshold } from './viewProgress.js';

test('a long video needs thirty seconds of watching', () => {
  assert.equal(VIEW_SECONDS, 30);
  assert.equal(viewThreshold(600), 30);
  assert.equal(viewThreshold(30), 30);
});

test('a short video needs the whole video, less the last half second', () => {
  assert.equal(viewThreshold(10), 9.5);
  assert.equal(viewThreshold(3), 2.5);
  assert.equal(viewThreshold(0.2), 0);
});

test('an unknown duration falls back to thirty seconds', () => {
  assert.equal(viewThreshold(NaN), 30);
  assert.equal(viewThreshold(undefined), 30);
  assert.equal(viewThreshold(0), 30);
});

test('normal playback steps add up', () => {
  let watched = 0;
  let last = null;
  for (let t = 0; t <= 31; t += 0.25) {
    watched = addWatched(watched, last, t, true);
    last = t;
  }
  assert.ok(Math.abs(watched - 31) < 1e-9);
  assert.equal(reachedView(watched, 600), true);
});

test('a seek forward does not count as watching', () => {
  let watched = addWatched(0, 0, 0.25, true);
  watched = addWatched(watched, 0.25, 31, true);
  watched = addWatched(watched, 31, 31.25, true);
  assert.equal(watched, 0.5);
  assert.equal(reachedView(watched, 600), false);
});

test('a step backwards, a pause and the first event add nothing', () => {
  assert.equal(addWatched(5, 10, 2, true), 5);
  assert.equal(addWatched(5, 10, 10.25, false), 5);
  assert.equal(addWatched(5, null, 0.25, true), 5);
});

test('double speed still counts in video time', () => {
  let watched = 0;
  let last = 0;
  for (let t = 0.5; t <= 30; t += 0.5) {
    watched = addWatched(watched, last, t, true);
    last = t;
  }
  assert.equal(reachedView(watched, 600), true);
});

test('watching all of a three-second clip counts even if the last event is early', () => {
  let watched = 0;
  let last = 0;
  for (const t of [0.25, 0.5, 1, 1.5, 2, 2.5, 2.95]) {
    watched = addWatched(watched, last, t, true);
    last = t;
  }
  assert.equal(reachedView(watched, 3), true);
});
