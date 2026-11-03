import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { memoryDb } from './helpers.js';
import { world, type Who, type World } from './world.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let w: World;
let owner: Who;
let fan: Who;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  w = world(await mongo.fresh());
  owner = await w.user('creator@example.com');
  fan = await w.user('fan@example.com');
});

const grant = async (video: string, who?: Who) =>
  (await w.call('get', `/videos/${video}/playback`, undefined, who ? { token: who.token } : {})).body.playbackToken as string;
const beat = (video: string, pt: string, body: object, who?: Who) =>
  w.call('post', `/videos/${video}/heartbeat`, body, { headers: { 'x-playback-token': pt }, ...(who ? { token: who.token } : {}) });

describe('heartbeats, resume and history', () => {
  it('stores the resume position and lists history newest first, hiding unavailable videos', async () => {
    const a = await w.video(owner.id);
    const b = await w.video(owner.id);
    await beat(a, await grant(a, fan), { positionSec: 42.7, watchedSec: 60 }, fan);
    w.tick(1000);
    await beat(b, await grant(b, fan), { positionSec: 10, watchedSec: 10 }, fan);
    expect((await w.call('get', `/me/progress/${a}`, undefined, { token: fan.token })).body.positionSec).toBe(42);

    const history = await w.call('get', '/me/history', undefined, { token: fan.token });
    expect(history.body.items.map((i: { id: string }) => i.id)).toEqual([b, a]);
    await w.db.collection('videos').updateOne({ _id: new ObjectId(b) }, { $set: { visibility: 'private' } });
    expect((await w.call('get', '/me/history', undefined, { token: fan.token })).body.items.map((i: { id: string }) => i.id)).toEqual([a]);

    await w.call('delete', `/me/history/${a}`, undefined, { token: fan.token });
    expect((await w.call('get', '/me/history', undefined, { token: fan.token })).body.items).toEqual([]);
    expect((await w.call('delete', '/me/history', undefined, { token: fan.token })).body.removed).toBe(1);
  });

  it('counts at most one minute of watch time per viewer and minute, never for the owner', async () => {
    const id = await w.video(owner.id, { durationSec: 600 });
    const pt = await grant(id, fan);
    for (let i = 0; i < 5; i += 1) await beat(id, pt, { positionSec: 300, watchedSec: 3600 }, fan);
    const hour = w.ctx.clock.now.toISOString().slice(0, 13);
    const row = w.ctx.activity.beats.get(`${hour}|${id}`);
    expect(row?.get('watchSeconds')).toBe(60);
    expect(row?.get('beats')).toBe(1);
    expect(row?.get('r10')).toBe(1);

    w.tick(60_000);
    expect((await beat(id, pt, { positionSec: 360, watchedSec: 60 }, fan)).body.counted).toBe(true);
    expect(w.ctx.activity.beats.get(`${hour}|${id}`)?.get('watchSeconds')).toBe(120);

    const ownPt = await grant(id, owner);
    w.tick(60_000);
    await beat(id, ownPt, { positionSec: 1, watchedSec: 60 }, owner);
    expect(w.ctx.activity.beats.get(`${hour}|${id}`)?.get('watchSeconds')).toBe(120);
    expect((await beat(id, 'bad', { positionSec: 1, watchedSec: 1 })).status).toBe(401);
  });
});

describe('playlists', () => {
  it('keeps order, refuses duplicates and reorders only with the full list', async () => {
    const ids = [await w.video(owner.id), await w.video(owner.id), await w.video(owner.id)];
    const pl = (await w.call('post', '/me/playlists', { title: 'Mix', visibility: 'unlisted' }, { token: fan.token })).body.playlist.id as string;
    for (const id of ids) expect((await w.call('post', `/playlists/${pl}/items`, { videoId: id }, { token: fan.token })).status).toBe(201);
    expect((await w.call('post', `/playlists/${pl}/items`, { videoId: ids[0] }, { token: fan.token })).body.error.code).toBe('ALREADY_IN_PLAYLIST');

    const listed = await w.call('get', `/playlists/${pl}`);
    expect(listed.body.items.map((i: { id: string }) => i.id)).toEqual(ids);

    expect((await w.call('put', `/playlists/${pl}/order`, { videoIds: [ids[2], ids[0]] }, { token: fan.token })).body.error.code).toBe('ORDER_MISMATCH');
    expect((await w.call('put', `/playlists/${pl}/order`, { videoIds: [ids[2], ids[0], ids[1]] }, { token: fan.token })).status).toBe(204);
    expect((await w.call('get', `/playlists/${pl}`)).body.items.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[0], ids[1]]);

    expect((await w.call('post', `/playlists/${pl}/items`, { videoId: ids[0] }, { token: owner.token })).status).toBe(404);
  });

  it('hides private playlists and shows deleted or private videos as unavailable without titles', async () => {
    const [a, b] = [await w.video(owner.id), await w.video(owner.id)];
    const pl = (await w.call('post', '/me/playlists', { title: 'Secret list' }, { token: fan.token })).body.playlist.id as string;
    await w.call('post', `/playlists/${pl}/items`, { videoId: a }, { token: fan.token });
    await w.call('post', `/playlists/${pl}/items`, { videoId: b }, { token: fan.token });
    expect((await w.call('get', `/playlists/${pl}`)).status).toBe(404);
    expect((await w.call('get', `/playlists/${pl}`, undefined, { token: owner.token })).status).toBe(404);

    await w.db.collection('videos').updateOne({ _id: new ObjectId(a) }, { $set: { visibility: 'private' } });
    await w.db.collection('videos').deleteOne({ _id: new ObjectId(b) });
    const res = await w.call('get', `/playlists/${pl}`, undefined, { token: fan.token });
    expect(res.body.items).toEqual([
      { id: a, unavailable: true, addedAt: expect.any(String) },
      { id: b, unavailable: true, addedAt: expect.any(String) },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Secret title');
  });

  it('gives each user one watch later list that cannot be renamed or deleted', async () => {
    const id = await w.video(owner.id);
    expect((await w.call('post', '/playlists/watch-later/items', { videoId: id }, { token: fan.token })).status).toBe(201);
    const [first, second] = await Promise.all([
      w.call('get', '/me/playlists', undefined, { token: fan.token }),
      w.call('get', '/me/playlists', undefined, { token: fan.token }),
    ]);
    expect(first.body.items.filter((p: { kind: string }) => p.kind === 'watch_later')).toHaveLength(1);
    expect(second.body.items[0]).toMatchObject({ id: 'watch-later', count: 1 });
    expect((await w.call('patch', '/playlists/watch-later', { title: 'x' }, { token: fan.token })).body.error.code).toBe('SYSTEM_PLAYLIST');
    expect((await w.call('delete', '/playlists/watch-later', undefined, { token: fan.token })).body.error.code).toBe('SYSTEM_PLAYLIST');
    expect((await w.call('get', '/playlists/watch-later')).status).toBe(404);
  });
});

describe('subscriptions feed', () => {
  it('lists public ready videos of subscribed channels only', async () => {
    const other = await w.user('other@example.com');
    const mine = await w.video(owner.id);
    await w.video(owner.id, { visibility: 'unlisted' });
    await w.video(other.id);
    expect((await w.call('get', '/me/feed', undefined, { token: fan.token })).body.items).toEqual([]);
    await w.call('put', `/channels/${owner.id}/subscription`, undefined, { token: fan.token });
    expect((await w.call('get', '/me/feed', undefined, { token: fan.token })).body.items.map((v: { id: string }) => v.id)).toEqual([mine]);
  });
});
