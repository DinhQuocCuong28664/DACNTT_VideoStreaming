import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ObjectId, type Db } from 'mongodb';
import { configure as serverlessExpress } from '@codegenie/serverless-express';
import { keyObject } from '@zelos/shared';
import { authFeature } from '../src/features/auth.js';
import { uploadsFeature } from '../src/features/uploads.js';
import { videosFeature, VIEW_WINDOW_SEC } from '../src/features/videos.js';
import { mongoSessionLookup } from '../src/auth/sessions.js';
import type { VideoDoc } from '../src/model/video.js';
import { ORIGIN_SECRET, WEB, memoryDb, testApp, type TestContext } from './helpers.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let db: Db;
let app: ReturnType<typeof testApp>['app'];
let ctx: TestContext;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  db = await mongo.fresh();
  ({ app, ctx } = testApp([authFeature, uploadsFeature, videosFeature], { db, sessions: mongoSessionLookup(db) }));
});

type Opts = { token?: string; headers?: Record<string, string> };
const send = (method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object, o: Opts = {}) => {
  const agent = request(app);
  const url = `/v1${path}`;
  const begun = method === 'get' ? agent.get(url) : method === 'post' ? agent.post(url) : method === 'patch' ? agent.patch(url) : agent.delete(url);
  let r = begun.set('x-origin-verify', ORIGIN_SECRET).set('cf-connecting-ip', '198.51.100.30');
  if (o.token) r = r.set('authorization', `Bearer ${o.token}`);
  for (const [k, v] of Object.entries(o.headers ?? {})) r = r.set(k, v);
  return body ? r.send(body) : r;
};

async function user(email: string, role = 'user') {
  const res = await send('post', '/auth/register', { email, password: 'correct horse battery', displayName: email.split('@')[0] });
  await db.collection('users').updateOne({ email }, { $set: { emailVerified: true, role } });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

async function seedVideo(owner: string, over: Partial<VideoDoc> = {}): Promise<string> {
  const _id = new ObjectId();
  const at = ctx.clock.now;
  const doc: VideoDoc = {
    _id, owner: new ObjectId(owner), channelName: 'Owner', title: 'Secret title', description: 'd', tags: [], category: 'music',
    status: 'READY', step: 'publish', processingProgress: 100, uploadVersion: 2, visibility: 'public', passwordHash: null,
    audience: 'public', publishAt: null, scheduleName: null,
    upload: { mode: 'post', size: 10, contentType: 'video/mp4', fileName: 'a.mp4', partSize: null, uploadId: null, startedAt: at, completedAt: at },
    hlsPath: `videos/${_id.toHexString()}/v2/master.m3u8`, renditions: [], durationSec: 120, thumbnail: `videos/${_id.toHexString()}/v2/thumbnail.jpg`,
    customThumbnail: null, previewVtt: null, captions: [], chapters: [], moderation: { status: 'approved' }, hasViolence: false,
    counters: { views: 0, likes: 0, dislikes: 0, comments: 0 }, error: null, createdAt: at, updatedAt: at, processedAt: at,
    ...over,
  };
  await db.collection('videos').insertOne(doc);
  await ctx.deps.storage.put('keys', keyObject(_id.toHexString(), doc.uploadVersion), JSON.stringify({ keyHex: '00112233445566778899aabbccddeeff', ivHex: 'ff'.repeat(16) }), 'application/json');
  return _id.toHexString();
}

let owner: { token: string; id: string };
let viewer: { token: string; id: string };
beforeEach(async () => {
  owner = await user('owner@example.com');
  viewer = await user('viewer@example.com');
});

describe('access rule', () => {
  it('hides private, unready and scheduled videos from strangers without revealing them', async () => {
    for (const over of [{ visibility: 'private' as const }, { status: 'PROCESSING' as const }, { status: 'SCHEDULED' as const }, { status: 'ERROR' as const }]) {
      const id = await seedVideo(owner.id, over);
      expect((await send('get', `/videos/${id}`, undefined, { token: viewer.token })).status).toBe(404);
      expect((await send('get', `/videos/${id}`)).status).toBe(404);
      const own = await send('get', `/videos/${id}`, undefined, { token: owner.token });
      expect(own.status).toBe(200);
      expect(own.body.video.status).toBeDefined();
    }
    expect((await send('get', `/videos/${new ObjectId().toHexString()}`)).status).toBe(404);
    expect((await send('get', '/videos/zzz')).status).toBe(404);
  });

  it('answers 403 for removed and under-review videos; the owner opens but cannot play a removed one; staff can review', async () => {
    const removed = await seedVideo(owner.id, { moderation: { status: 'removed', reasonCode: 'violence' } });
    const review = await seedVideo(owner.id, { moderation: { status: 'review' } });
    expect((await send('get', `/videos/${removed}`)).body.error.code).toBe('VIDEO_REMOVED');
    expect((await send('get', `/videos/${review}`)).body.error.code).toBe('VIDEO_UNDER_REVIEW');

    const own = await send('get', `/videos/${removed}`, undefined, { token: owner.token });
    expect(own.body.video).toMatchObject({ locked: 'removed', moderation: { status: 'removed', reasonCode: 'violence' } });
    expect((await send('get', `/videos/${removed}/playback`, undefined, { token: owner.token })).body.error.code).toBe('VIDEO_REMOVED');

    const staff = await user('op@example.com', 'operator');
    expect((await send('get', `/videos/${removed}/playback`, undefined, { token: staff.token })).status).toBe(200);
    const auditor = await user('audit@example.com', 'auditor');
    expect((await send('get', `/videos/${removed}`, undefined, { token: auditor.token })).status).toBe(403);
  });

  it('locks members-only videos for non-members without a playlist URL', async () => {
    const id = await seedVideo(owner.id, { audience: 'members' });
    const res = await send('get', `/videos/${id}`, undefined, { token: viewer.token });
    expect(res.body.video).toMatchObject({ title: 'Secret title', locked: 'members' });
    const play = await send('get', `/videos/${id}/playback`, undefined, { token: viewer.token });
    expect(play.status).toBe(403);
    expect(play.body.error.code).toBe('MEMBERS_ONLY');
    expect(JSON.stringify(play.body)).not.toContain('master.m3u8');

    await db.collection('memberships').insertOne({ member: new ObjectId(viewer.id), channel: new ObjectId(owner.id), tier: new ObjectId(), level: 1, expiresAt: new Date(ctx.clock.now.getTime() + 86_400_000) });
    expect((await send('get', `/videos/${id}/playback`, undefined, { token: viewer.token })).status).toBe(200);
  });

  it('keeps the title of a password video hidden until it is unlocked, per video', async () => {
    const id = await seedVideo(owner.id, { visibility: 'password', passwordHash: await ctx.deps.passwords.hash('open sesame') });
    const other = await seedVideo(owner.id, { visibility: 'password', passwordHash: await ctx.deps.passwords.hash('open sesame') });
    const stub = await send('get', `/videos/${id}`);
    expect(stub.body.video).toEqual({ id, locked: 'password' });
    const wrong = await send('post', `/videos/${id}/unlock`, { password: 'nope' });
    expect(wrong.status).toBe(403);
    expect(JSON.stringify(wrong.body)).not.toContain('Secret');

    const ok = await send('post', `/videos/${id}/unlock`, { password: 'open sesame' });
    const headers = { 'x-unlock-token': ok.body.unlockToken as string };
    expect((await send('get', `/videos/${id}`, undefined, { headers })).body.video.title).toBe('Secret title');
    expect((await send('get', `/videos/${id}/playback`, undefined, { headers })).status).toBe(200);
    expect((await send('get', `/videos/${other}`, undefined, { headers })).body.video).toEqual({ id: other, locked: 'password' });
  });

  it('rate-limits password guesses', async () => {
    const id = await seedVideo(owner.id, { visibility: 'password', passwordHash: await ctx.deps.passwords.hash('open sesame') });
    for (let i = 0; i < 10; i += 1) await send('post', `/videos/${id}/unlock`, { password: `guess${i}` });
    expect((await send('post', `/videos/${id}/unlock`, { password: 'open sesame' })).status).toBe(429);
  });
});

describe('playback and key', () => {
  it('grants a policy scoped to the video and a token that fetches the 16-byte key', async () => {
    const id = await seedVideo(owner.id);
    const play = await send('get', `/videos/${id}/playback`);
    expect(play.status).toBe(200);
    expect(play.body.masterUrl).toBe(`https://cdn.example.test/videos/${id}/v2/master.m3u8`);
    expect(play.body.cdnQuery.Policy).toBe(`videos/${id}/*`);

    const key = await send('get', `/videos/${id}/key?v=2`, undefined, { headers: { 'x-playback-token': play.body.playbackToken, origin: WEB } })
      .buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(key.status).toBe(200);
    expect(key.headers['content-type']).toContain('application/octet-stream');
    expect((key.body as Buffer).toString('hex')).toBe('00112233445566778899aabbccddeeff');
    expect(key.headers['access-control-allow-origin']).toBe(WEB);
  });

  it('refuses the key for another origin, another video, another version or a missing token', async () => {
    const id = await seedVideo(owner.id);
    const other = await seedVideo(owner.id);
    const token = (await send('get', `/videos/${id}/playback`)).body.playbackToken as string;
    expect((await send('get', `/videos/${id}/key?v=2`, undefined, { headers: { 'x-playback-token': token, origin: 'https://evil.example' } })).status).toBe(403);
    expect((await send('get', `/videos/${other}/key?v=2`, undefined, { headers: { 'x-playback-token': token } })).status).toBe(401);
    expect((await send('get', `/videos/${id}/key?v=1`, undefined, { headers: { 'x-playback-token': token } })).status).toBe(401);
    expect((await send('get', `/videos/${id}/key?v=2`)).status).toBe(401);
  });

  it('stops serving the key once the video is removed', async () => {
    const id = await seedVideo(owner.id);
    const token = (await send('get', `/videos/${id}/playback`)).body.playbackToken as string;
    await db.collection('videos').updateOne({ _id: new ObjectId(id) }, { $set: { 'moderation.status': 'removed' } });
    expect((await send('get', `/videos/${id}/key?v=2`, undefined, { headers: { 'x-playback-token': token } })).status).toBe(403);
  });

  it('returns the key as raw bytes through the Lambda adapter', async () => {
    const id = await seedVideo(owner.id);
    const token = (await send('get', `/videos/${id}/playback`)).body.playbackToken as string;
    const handler = serverlessExpress({ app, binarySettings: { contentTypes: ['application/octet-stream'] } }) as unknown as (e: unknown, c: unknown) => Promise<{ statusCode: number; body: string; isBase64Encoded: boolean }>;
    const event = {
      version: '2.0', routeKey: '$default', rawPath: `/v1/videos/${id}/key`, rawQueryString: 'v=2',
      headers: { 'x-origin-verify': ORIGIN_SECRET, 'x-playback-token': token, host: 'lambda.test' },
      requestContext: { http: { method: 'GET', path: `/v1/videos/${id}/key`, sourceIp: '198.51.100.1' }, domainName: 'lambda.test', requestId: 'r1', timeEpoch: Date.now() },
      isBase64Encoded: false,
    };
    const out = await handler(event, { succeed: () => undefined });
    expect(out.statusCode).toBe(200);
    expect(out.isBase64Encoded).toBe(true);
    expect(Buffer.from(out.body, 'base64').toString('hex')).toBe('00112233445566778899aabbccddeeff');
  });
});

describe('views', () => {
  it('counts after 30 seconds of playback, once per viewer per window, never for the owner', async () => {
    const id = await seedVideo(owner.id);
    const grant = async (token?: string) => (await send('get', `/videos/${id}/playback`, undefined, token ? { token } : {})).body.playbackToken as string;
    const view = (pt: string, token?: string) => send('post', `/videos/${id}/view`, {}, { headers: { 'x-playback-token': pt }, ...(token ? { token } : {}) });

    const pt = await grant(viewer.token);
    expect((await view(pt, viewer.token)).body.counted).toBe(false); // too early
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 31_000);
    expect((await view(pt, viewer.token)).body).toEqual({ counted: true, views: 1 });
    expect(ctx.activity.beats.get(`${ctx.clock.now.toISOString().slice(0, 13)}|${id}`)?.get('views')).toBe(1);
    expect((await view(pt, viewer.token)).body.counted).toBe(false);

    const ownPt = await grant(owner.token);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 31_000);
    expect((await view(ownPt, owner.token)).body.counted).toBe(false);

    // A guest counts by address; after the window the same viewer counts again.
    const guestPt = await grant();
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 31_000);
    expect((await view(guestPt)).body.counted).toBe(true);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + VIEW_WINDOW_SEC * 1000);
    const later = await grant(viewer.token);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 31_000);
    expect((await view(later, viewer.token)).body).toEqual({ counted: true, views: 3 });
  });

  it('counts a short video after its whole length', async () => {
    const id = await seedVideo(owner.id, { durationSec: 8 });
    const pt = (await send('get', `/videos/${id}/playback`)).body.playbackToken as string;
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 9_000);
    expect((await send('post', `/videos/${id}/view`, {}, { headers: { 'x-playback-token': pt } })).body.counted).toBe(true);
  });
});

describe('listing, editing and deleting', () => {
  it('lists public approved ready videos newest first with a cursor', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(await seedVideo(owner.id, { processedAt: new Date(ctx.clock.now.getTime() - i * 1000) }));
    }
    await seedVideo(owner.id, { visibility: 'unlisted' });
    await seedVideo(owner.id, { moderation: { status: 'review' } });
    const first = await send('get', '/videos?limit=3');
    expect(first.body.items.map((v: { id: string }) => v.id)).toEqual(ids.slice(0, 3));
    expect(first.body.items[0].thumbnail).toContain('thumbnail.jpg?Expires=');
    const second = await send('get', `/videos?limit=3&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((v: { id: string }) => v.id)).toEqual(ids.slice(3));
    expect(second.body.nextCursor).toBeNull();
    expect((await send('get', '/videos?cursor=bad')).status).toBe(400);
  });

  it('lets only the owner edit, and needs a password for password visibility', async () => {
    const id = await seedVideo(owner.id);
    expect((await send('patch', `/videos/${id}`, { title: 'x' }, { token: viewer.token })).status).toBe(404);
    expect((await send('patch', `/videos/${id}`, { visibility: 'password' }, { token: owner.token })).body.error.code).toBe('PASSWORD_REQUIRED');
    expect((await send('patch', `/videos/${id}`, { audience: 'members' }, { token: owner.token })).body.error.code).toBe('NO_TIERS');
    expect((await send('patch', `/videos/${id}`, { status: 'READY' }, { token: owner.token })).status).toBe(400);
    const ok = await send('patch', `/videos/${id}`, { title: 'New', tags: ['A', 'a', 'b'], visibility: 'password', password: 'open sesame' }, { token: owner.token });
    expect(ok.status).toBe(200);
    expect(ok.body.video).toMatchObject({ title: 'New', tags: ['a', 'b'], visibility: 'password' });
  });

  it('deletes the document, its comments and its files', async () => {
    const id = await seedVideo(owner.id);
    await ctx.deps.storage.put('processed', `videos/${id}/v2/master.m3u8`, '#EXTM3U', 'application/vnd.apple.mpegurl');
    await ctx.deps.storage.put('raw', `raw/${id}/2/source`, 'x', 'video/mp4');
    await db.collection('comments').insertOne({ video: new ObjectId(id), body: 'hi' });
    expect((await send('delete', `/videos/${id}`, undefined, { token: viewer.token })).status).toBe(404);
    expect((await send('delete', `/videos/${id}`, undefined, { token: owner.token })).status).toBe(204);
    expect(await db.collection('videos').countDocuments()).toBe(0);
    expect(await db.collection('comments').countDocuments()).toBe(0);
    expect([...ctx.s3.objects.keys()].filter((k) => k.includes(id))).toEqual([]);
  });
});
