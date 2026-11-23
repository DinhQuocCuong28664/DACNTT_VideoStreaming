import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEARCH_INDEXES } from '../src/services/search.js';
import { SEARCH_PAGE, trendingScore } from '../src/features/discovery.js';
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

describe('search index definitions', () => {
  it('fold Vietnamese letters, map filters as tokens and stay within three indexes', () => {
    expect(SEARCH_INDEXES).toHaveLength(3);
    const videos = SEARCH_INDEXES.find((i) => i.name === 'videos_search')?.definition;
    const analyzer = (videos?.['analyzers'] as { charFilters: { mappings: Record<string, string> }[]; tokenFilters: { type: string }[] }[])[0];
    expect(analyzer?.charFilters[0]?.mappings).toEqual({ 'đ': 'd', 'Đ': 'D' });
    expect(analyzer?.tokenFilters.map((f) => f.type)).toEqual(['lowercase', 'icuFolding']);
    const fields = (videos?.['mappings'] as { fields: Record<string, unknown> }).fields;
    expect(fields['visibility']).toEqual({ type: 'token' });
    expect(JSON.stringify(fields['title'])).toContain('autocomplete');
  });
});

describe('search', () => {
  it('keeps the search order and drops anything not public, ready and approved', async () => {
    const a = await w.video(owner.id, { title: 'Nhạc A' });
    const b = await w.video(owner.id, { title: 'Nhạc B' });
    const hidden = await w.video(owner.id, { visibility: 'private' });
    const removed = await w.video(owner.id, { moderation: { status: 'removed' } });
    w.ctx.searchResults.videos = [b, hidden, a, removed];
    w.ctx.searchResults.channels = [owner.id];
    const res = await w.call('get', '/search?q=nhac');
    expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([b, a]);
    expect(res.body.channels.map((c: { id: string }) => c.id)).toEqual([owner.id]);
    expect(res.body.nextPage).toBeNull();
    expect((await w.call('get', '/search?q=')).status).toBe(400);
  });

  it('pages by offset up to ten pages', async () => {
    w.ctx.searchResults.videos = Array.from({ length: SEARCH_PAGE + 5 }, () => '0'.repeat(24));
    expect((await w.call('get', '/search?q=x')).body.nextPage).toBe(2);
    await w.call('get', '/search?q=x&page=2');
    expect(w.ctx.searchResults.calls.at(-1)).toEqual({ q: 'x', skip: SEARCH_PAGE });
    expect((await w.call('get', '/search?q=x&page=11')).status).toBe(400);
  });

  it('suggests only after two characters', async () => {
    w.ctx.searchResults.suggest = ['nhạc trẻ', 'nhạc vàng'];
    expect((await w.call('get', '/search/suggest?q=n')).body.items).toEqual([]);
    expect((await w.call('get', '/search/suggest?q=nh')).body.items).toEqual(['nhạc trẻ', 'nhạc vàng']);
  });
});

describe('related videos', () => {
  it('prefers the same channel, category or tags and never lists hidden videos', async () => {
    const id = await w.video(owner.id, { tags: ['rock'] });
    const sameTag = await w.video(fan.id, { tags: ['rock'], category: 'gaming' });
    await w.video(owner.id, { visibility: 'unlisted' });
    const other = await w.video(fan.id, { category: 'gaming' });
    const res = await w.call('get', `/videos/${id}/related`);
    const ids = res.body.items.map((v: { id: string }) => v.id);
    expect(ids[0]).toBe(sameTag);
    expect(ids).toContain(other);
    expect(ids).not.toContain(id);
    expect(ids).toHaveLength(2);
  });
});

describe('notifications', () => {
  it('lists newest first with the unread count and marks them read', async () => {
    w.ctx.activity.notes.set(fan.id, [
      { id: '2026-11-01T00:00:00Z#a', type: 'upload', createdAt: '2026-11-01T00:00:00Z', read: false, data: {} },
      { id: '2026-11-02T00:00:00Z#b', type: 'upload', createdAt: '2026-11-02T00:00:00Z', read: false, data: {} },
    ]);
    const res = await w.call('get', '/me/notifications', undefined, { token: fan.token });
    expect(res.body.items.map((n: { id: string }) => n.id)).toEqual(['2026-11-02T00:00:00Z#b', '2026-11-01T00:00:00Z#a']);
    expect(res.body.unread).toBe(2);
    expect((await w.call('post', '/me/notifications/read', { ids: ['2026-11-02T00:00:00Z#b'] }, { token: fan.token })).body.unread).toBe(1);
    expect((await w.call('get', '/me/notifications')).status).toBe(401);
  });
});

describe('trending', () => {
  it('ranks views against age and leaves out unwatched and hidden videos', () => {
    // Twice the views at twice the age is not enough: age weighs more than linearly.
    expect(trendingScore(100, 10)).toBeGreaterThan(trendingScore(200, 20));
    expect(trendingScore(0, 1)).toBe(0);
  });

  it('puts a fresh popular video above an old more viewed one', async () => {
    const old = await w.video(owner.id, { counters: { views: 500, likes: 0, dislikes: 0, comments: 0 } });
    w.tick(30 * 86_400_000);
    const fresh = await w.video(owner.id, { counters: { views: 50, likes: 0, dislikes: 0, comments: 0 } });
    await w.video(owner.id);
    await w.video(owner.id, { visibility: 'unlisted', counters: { views: 9000, likes: 0, dislikes: 0, comments: 0 } });
    w.tick(3_600_000);
    const res = await w.call('get', '/trending');
    expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([fresh, old]);
  });
});

describe('not interested', () => {
  it('hides the video from the feed, related videos and trending of that viewer only, and can be undone', async () => {
    const base = await w.video(owner.id, { tags: ['rock'] });
    const target = await w.video(owner.id, { tags: ['rock'], counters: { views: 5, likes: 0, dislikes: 0, comments: 0 } });
    const ids = (r: { body: { items: { id: string }[] } }) => r.body.items.map((v) => v.id);
    const as = { token: fan.token };

    expect((await w.call('put', `/me/not-interested/${target}`, undefined, as)).status).toBe(204);
    expect((await w.call('put', `/me/not-interested/${target}`, undefined, as)).status).toBe(204);
    expect(ids(await w.call('get', '/videos', undefined, as))).toEqual([base]);
    expect(ids(await w.call('get', `/videos/${base}/related`, undefined, as))).toEqual([]);
    expect(ids(await w.call('get', '/trending', undefined, as))).toEqual([]);
    // Other viewers still see it.
    expect(ids(await w.call('get', '/videos'))).toContain(target);

    await w.call('delete', `/me/not-interested/${target}`, undefined, as);
    expect(ids(await w.call('get', '/videos', undefined, as))).toContain(target);
    expect((await w.call('put', '/me/not-interested/aaaaaaaaaaaaaaaaaaaaaaaa', undefined, as)).status).toBe(404);
    expect((await w.call('put', `/me/not-interested/${target}`)).status).toBe(401);
  });
});

describe('hashtags', () => {
  it('lists the public videos of one tag, with or without the # sign', async () => {
    const a = await w.video(owner.id, { tags: ['travel', 'food'] });
    await w.video(owner.id, { tags: ['food'] });
    await w.video(owner.id, { tags: ['travel'], visibility: 'private' });
    for (const tag of ['travel', '%23Travel']) {
      const res = await w.call('get', `/videos?tag=${tag}`);
      expect(res.body.items.map((v: { id: string }) => v.id)).toEqual([a]);
    }
  });
});
