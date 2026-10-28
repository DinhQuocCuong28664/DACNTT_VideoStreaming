import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  await w.call('patch', '/me/profile', { handle: 'nhac.viet' }, { token: owner.token });
});

const tier = (level: number, name = `Tier ${level}`) =>
  w.call('post', '/me/tiers', { name, price: 29000 * level, level, perks: ['badge'] }, { token: owner.token });

describe('channel page', () => {
  it('opens by id or @handle and shows only public ready videos', async () => {
    await w.video(owner.id);
    await w.video(owner.id, { visibility: 'unlisted' });
    await w.video(owner.id, { status: 'PROCESSING' });
    const byHandle = await w.call('get', '/channels/@Nhac.Viet');
    expect(byHandle.status).toBe(200);
    expect(byHandle.body.channel).toMatchObject({ id: owner.id, handle: 'nhac.viet', videos: 1 });
    expect(byHandle.body.channel.email).toBeUndefined();
    expect((await w.call('get', `/channels/${owner.id}`)).body.channel.handle).toBe('nhac.viet');
    expect((await w.call('get', '/channels/@nobody')).status).toBe(404);
    expect((await w.call('get', `/channels/${owner.id}/videos`)).body.items).toHaveLength(1);
  });
});

describe('subscriptions', () => {
  it('is idempotent, refuses self and recounts subscribers', async () => {
    expect((await w.call('put', `/channels/${owner.id}/subscription`, undefined, { token: owner.token })).body.error.code).toBe('SELF_SUBSCRIBE');
    await Promise.all([1, 2, 3].map(() => w.call('put', `/channels/${owner.id}/subscription`, undefined, { token: fan.token })));
    const page = await w.call('get', `/channels/${owner.id}`, undefined, { token: fan.token });
    expect(page.body.channel.subscribers).toBe(1);
    expect(page.body.viewer.subscribed).toBe(true);
    expect((await w.call('get', '/me/subscriptions', undefined, { token: fan.token })).body.items.map((c: { id: string }) => c.id)).toEqual([owner.id]);
    expect((await w.call('delete', `/channels/${owner.id}/subscription`, undefined, { token: fan.token })).body.subscribers).toBe(0);
  });
});

describe('memberships', () => {
  it('lets only the owner manage tiers, and two creates of one level read the winner', async () => {
    const [a, b] = await Promise.all([tier(1, 'Fan'), tier(1, 'Fan again')]);
    expect(a.body.tier.id).toBe(b.body.tier.id);
    const page = await w.call('get', `/channels/${owner.id}`);
    expect(page.body.tiers).toHaveLength(1);
    const patched = await w.call('patch', `/me/tiers/${a.body.tier.id}`, { price: 1000 }, { token: fan.token });
    expect(patched.status).toBe(404);
  });

  it('joins with a sandbox payment, unlocks by tier level and refuses the own channel', async () => {
    const low = (await tier(1)).body.tier.id as string;
    const high = (await tier(2)).body.tier.id as string;
    const video = await w.video(owner.id, { audience: 'members', minTierLevel: 2 });
    expect((await w.call('put', `/channels/${owner.id}/membership`, { tierId: low }, { token: owner.token })).body.error.code).toBe('SELF_MEMBERSHIP');

    const joined = await w.call('put', `/channels/${owner.id}/membership`, { tierId: low }, { token: fan.token });
    expect(joined.body.membership).toMatchObject({ level: 1, cancelled: false });
    expect((await w.call('get', `/videos/${video}/playback`, undefined, { token: fan.token })).body.error.code).toBe('MEMBERS_ONLY');

    const upgraded = await w.call('put', `/channels/${owner.id}/membership`, { tierId: high }, { token: fan.token });
    expect(upgraded.body.membership.expiresAt).toBe(joined.body.membership.expiresAt);
    expect((await w.call('get', `/videos/${video}/playback`, undefined, { token: fan.token })).status).toBe(200);

    const roster = await w.call('get', '/me/members', undefined, { token: owner.token });
    expect(roster.body.items[0]).toMatchObject({ member: { id: fan.id }, level: 2 });

    // Cancelling keeps access until the paid period ends.
    expect((await w.call('delete', `/channels/${owner.id}/membership`, undefined, { token: fan.token })).body.membership.cancelled).toBe(true);
    expect((await w.call('get', `/videos/${video}/playback`, undefined, { token: fan.token })).status).toBe(200);
    w.tick(31 * 86_400_000);
    fan = await w.relogin(fan);
    expect((await w.call('get', `/videos/${video}/playback`, undefined, { token: fan.token })).status).toBe(403);
  });
});

describe('profile', () => {
  it('limits handle changes and refuses taken or reserved handles', async () => {
    expect((await w.call('patch', '/me/profile', { handle: 'studio' }, { token: fan.token })).body.error.code).toBe('HANDLE_TAKEN');
    expect((await w.call('patch', '/me/profile', { handle: 'nhac.viet' }, { token: fan.token })).body.error.code).toBe('HANDLE_TAKEN');
    expect((await w.call('patch', '/me/profile', { handle: 'fan.one' }, { token: fan.token })).status).toBe(200);
    expect((await w.call('patch', '/me/profile', { handle: 'fan.two' }, { token: fan.token })).status).toBe(200);
    expect((await w.call('patch', '/me/profile', { handle: 'fan.three' }, { token: fan.token })).body.error.code).toBe('HANDLE_CHANGE_LIMIT');
    w.tick(15 * 86_400_000);
    fan = await w.relogin(fan);
    expect((await w.call('patch', '/me/profile', { handle: 'fan.three' }, { token: fan.token })).status).toBe(200);
  });

  it('renames the channel on its videos for search', async () => {
    const id = await w.video(owner.id);
    await w.call('patch', '/me/profile', { displayName: 'Nhạc Việt' }, { token: owner.token });
    const v = await w.call('get', `/videos/${id}`);
    expect(v.body.video.channel.name).toBe('Nhạc Việt');
    const doc = await w.db.collection('videos').findOne({});
    expect(doc?.['channelName']).toBe('Nhạc Việt');
  });
});
