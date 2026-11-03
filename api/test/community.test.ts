import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { memoryDb } from './helpers.js';
import { world, type Who, type World } from './world.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let w: World;
let owner: Who;
let viewer: Who;
let other: Who;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  w = world(await mongo.fresh());
  [owner, viewer, other] = [await w.user('owner@example.com'), await w.user('viewer@example.com'), await w.user('other@example.com')];
});

const comment = (video: string, who: Who, body: string, parentId?: string) =>
  w.call('post', `/videos/${video}/comments`, { body, ...(parentId ? { parentId } : {}) }, { token: who.token });

describe('reactions', () => {
  it('keeps one reaction per user and recounts from the reactions', async () => {
    const id = await w.video(owner.id);
    expect((await w.call('put', `/videos/${id}/reaction`, { kind: 'like' }, { token: viewer.token })).body).toEqual({ kind: 'like', likes: 1 });
    await w.call('put', `/videos/${id}/reaction`, { kind: 'like' }, { token: viewer.token });
    await w.call('put', `/videos/${id}/reaction`, { kind: 'like' }, { token: other.token });
    expect((await w.call('put', `/videos/${id}/reaction`, { kind: 'dislike' }, { token: other.token })).body.likes).toBe(1);
    const v = await w.db.collection('videos').findOne({ _id: new ObjectId(id) });
    expect(v?.['counters']).toMatchObject({ likes: 1, dislikes: 1 });
    expect((await w.call('put', `/videos/${id}/reaction`, { kind: null }, { token: viewer.token })).body.likes).toBe(0);
    expect((await w.call('get', `/videos/${id}/reaction`, undefined, { token: other.token })).body.kind).toBe('dislike');
  });

  it('refuses reactions on videos the user cannot play', async () => {
    const id = await w.video(owner.id, { visibility: 'private' });
    expect((await w.call('put', `/videos/${id}/reaction`, { kind: 'like' }, { token: viewer.token })).status).toBe(404);
  });
});

describe('comments', () => {
  it('pages newest first with the pinned comment on top of the first page only', async () => {
    const id = await w.video(owner.id);
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push((await comment(id, viewer, `c${i}`)).body.comment.id);
    expect((await w.call('put', `/comments/${ids[1]}/pin`, undefined, { token: viewer.token })).status).toBe(403);
    expect((await w.call('put', `/comments/${ids[1]}/pin`, undefined, { token: owner.token })).status).toBe(204);

    const first = await w.call('get', `/videos/${id}/comments?limit=2`);
    expect(first.body.items.map((c: { body: string }) => c.body)).toEqual(['c1', 'c4', 'c3']);
    expect(first.body.total).toBe(5);
    const second = await w.call('get', `/videos/${id}/comments?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((c: { body: string }) => c.body)).toEqual(['c2', 'c0']);
    expect(second.body.nextCursor).toBeNull();

    // Pinning another moves the pin.
    await w.call('put', `/comments/${ids[3]}/pin`, undefined, { token: owner.token });
    const again = await w.call('get', `/videos/${id}/comments?limit=10`);
    expect(again.body.items.filter((c: { pinned: boolean }) => c.pinned).map((c: { body: string }) => c.body)).toEqual(['c3']);
  });

  it('keeps replies one level deep and reconciles counts on delete', async () => {
    const id = await w.video(owner.id);
    const top = (await comment(id, viewer, 'top')).body.comment.id as string;
    const reply = (await comment(id, other, 'reply', top)).body.comment;
    const nested = (await comment(id, owner, 'reply to reply', reply.id)).body.comment;
    expect(nested.parentId).toBe(top);
    expect(nested.byCreator).toBe(true);

    const replies = await w.call('get', `/comments/${top}/replies`);
    expect(replies.body.items.map((c: { body: string }) => c.body)).toEqual(['reply', 'reply to reply']);
    const list = await w.call('get', `/videos/${id}/comments`);
    expect(list.body.items[0].replyCount).toBe(2);

    expect((await w.call('delete', `/comments/${reply.id}`, undefined, { token: viewer.token })).status).toBe(403);
    expect((await w.call('delete', `/comments/${reply.id}`, undefined, { token: other.token })).status).toBe(204);
    expect((await w.call('get', `/videos/${id}/comments`)).body.items[0].replyCount).toBe(1);

    // The video owner may delete any comment; a thread goes with its replies.
    expect((await w.call('delete', `/comments/${top}`, undefined, { token: owner.token })).status).toBe(204);
    const v = await w.db.collection('videos').findOne({ _id: new ObjectId(id) });
    expect(v?.['counters'].comments).toBe(0);
    expect(await w.db.collection('comments').countDocuments()).toBe(0);
  });

  it('hides comments of locked videos and refuses a missing parent', async () => {
    const locked = await w.video(owner.id, { visibility: 'password', passwordHash: await w.ctx.deps.passwords.hash('open sesame') });
    expect((await w.call('get', `/videos/${locked}/comments`)).body.error.code).toBe('VIDEO_LOCKED');
    const id = await w.video(owner.id);
    expect((await comment(id, viewer, 'x', new ObjectId().toHexString())).body.error.code).toBe('PARENT_NOT_FOUND');
    expect((await comment(id, viewer, '   ')).status).toBe(400);
  });

  it('limits comment bursts', async () => {
    const id = await w.video(owner.id);
    for (let i = 0; i < 10; i += 1) await comment(id, viewer, `c${i}`);
    expect((await comment(id, viewer, 'one more')).status).toBe(429);
  });
});

describe('comment reports', () => {
  it('needs a listed reason, refuses own comments and counts repeats once', async () => {
    const id = await w.video(owner.id);
    const c = (await comment(id, viewer, 'rude')).body.comment.id as string;
    expect((await w.call('post', `/comments/${c}/report`, { reason: 'because' }, { token: other.token })).status).toBe(400);
    expect((await w.call('post', `/comments/${c}/report`, { reason: 'spam', details: 'x'.repeat(501) }, { token: other.token })).status).toBe(400);
    expect((await w.call('post', `/comments/${c}/report`, { reason: 'spam' }, { token: viewer.token })).body.error.code).toBe('OWN_COMMENT');
    expect((await w.call('post', `/comments/${c}/report`, { reason: 'spam' }, { token: other.token })).status).toBe(201);
    expect((await w.call('post', `/comments/${c}/report`, { reason: 'harassment' }, { token: other.token })).body.repeated).toBe(true);
    await w.call('post', `/comments/${c}/report`, { reason: 'harassment' }, { token: owner.token });
    const doc = await w.db.collection('comments').findOne({ _id: new ObjectId(c) });
    expect(doc?.['openReports']).toBe(2);
  });

  it('keeps the text of a removed comment on its reports', async () => {
    const id = await w.video(owner.id);
    const c = (await comment(id, viewer, 'rude words')).body.comment.id as string;
    await w.call('post', `/comments/${c}/report`, { reason: 'harassment' }, { token: other.token });
    const op = await w.user('op@example.com', 'operator');
    expect((await w.call('delete', `/comments/${c}`, undefined, { token: op.token })).status).toBe(204);
    const report = await w.db.collection('commentReports').findOne({});
    expect(report).toMatchObject({ status: 'actioned', commentText: 'rude words' });
  });
});
