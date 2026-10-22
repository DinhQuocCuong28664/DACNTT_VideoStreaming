import test from 'node:test';
import assert from 'node:assert/strict';
import { PICKABLE_AVATAR_TYPES, SERVER_AVATAR_TYPES, fitWithin, pngName, prepareAvatarFile } from './avatarImage.js';

test('the server takes JPEG and PNG, the picker also offers WebP', () => {
  assert.deepEqual(SERVER_AVATAR_TYPES, ['image/jpeg', 'image/png']);
  assert.ok(PICKABLE_AVATAR_TYPES.includes('image/webp'));
});

test('large pictures are scaled to fit 1024 pixels, small ones are kept', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1024, height: 768 });
  assert.deepEqual(fitWithin(600, 2400), { width: 256, height: 1024 });
  assert.deepEqual(fitWithin(200, 120), { width: 200, height: 120 });
});

test('the converted file is named .png', () => {
  assert.equal(pngName('me.webp'), 'me.png');
  assert.equal(pngName('photo.final.WEBP'), 'photo.final.png');
  assert.equal(pngName(''), 'avatar.png');
});

test('JPEG and PNG files pass through unchanged', async () => {
  const file = { type: 'image/png', name: 'a.png' };
  assert.equal(await prepareAvatarFile(file), file);
});

test('other types are refused', async () => {
  await assert.rejects(prepareAvatarFile({ type: 'image/gif', name: 'a.gif' }));
});
