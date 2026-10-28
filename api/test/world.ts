/** A full app on an in-memory database, with helpers to create users, videos and requests. */
import request from 'supertest';
import { ObjectId, type Db } from 'mongodb';
import { keyObject } from '@zelos/shared';
import { FEATURES } from '../src/features/index.js';
import { mongoSessionLookup } from '../src/auth/sessions.js';
import type { VideoDoc } from '../src/model/video.js';
import { ORIGIN_SECRET, testApp, type TestContext } from './helpers.js';

export interface Who { token: string; id: string }
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
export interface CallOpts { token?: string; headers?: Record<string, string>; ip?: string }

export function world(db: Db) {
  const { app, ctx } = testApp(FEATURES, { db, sessions: mongoSessionLookup(db) });

  const call = (method: Method, path: string, body?: object, o: CallOpts = {}) => {
    const agent = request(app);
    const url = `/v1${path}`;
    const begun = method === 'get' ? agent.get(url) : method === 'post' ? agent.post(url) : method === 'put' ? agent.put(url) : method === 'patch' ? agent.patch(url) : agent.delete(url);
    let r = begun.set('x-origin-verify', ORIGIN_SECRET).set('cf-connecting-ip', o.ip ?? '198.51.100.40');
    if (o.token) r = r.set('authorization', `Bearer ${o.token}`);
    for (const [k, v] of Object.entries(o.headers ?? {})) r = r.set(k, v);
    return body ? r.send(body) : r;
  };

  let users = 0;
  async function user(email: string, role = 'user'): Promise<Who> {
    users += 1;
    // Each sign-up from its own address, so the registration limit never interferes.
    const res = await call('post', '/auth/register', { email, password: 'correct horse battery', displayName: email.split('@')[0] }, { ip: `203.0.113.${users}` });
    if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
    await db.collection('users').updateOne({ email }, { $set: { emailVerified: true, role } });
    return { token: res.body.token as string, id: res.body.user.id as string };
  }

  async function video(owner: string, over: Partial<VideoDoc> = {}): Promise<string> {
    const _id = new ObjectId();
    const id = _id.toHexString();
    const at = ctx.clock.now;
    const doc: VideoDoc = {
      _id, owner: new ObjectId(owner), channelName: 'Owner', title: 'Secret title', description: 'd', tags: [], category: 'music',
      status: 'READY', step: 'publish', processingProgress: 100, uploadVersion: 2, visibility: 'public', passwordHash: null,
      audience: 'public', publishAt: null, scheduleName: null,
      upload: { mode: 'post', size: 10, contentType: 'video/mp4', fileName: 'a.mp4', partSize: null, uploadId: null, startedAt: at, completedAt: at },
      hlsPath: `videos/${id}/v2/master.m3u8`, renditions: [], durationSec: 120, thumbnail: `videos/${id}/v2/thumbnail.jpg`,
      customThumbnail: null, previewVtt: null, captions: [], chapters: [], moderation: { status: 'approved' }, hasViolence: false,
      counters: { views: 0, likes: 0, dislikes: 0, comments: 0 }, error: null, createdAt: at, updatedAt: at, processedAt: at,
      ...over,
    };
    await db.collection('videos').insertOne(doc);
    await ctx.deps.storage.put('keys', keyObject(id, doc.uploadVersion), JSON.stringify({ keyHex: '00112233445566778899aabbccddeeff', ivHex: 'ff'.repeat(16) }), 'application/json');
    return id;
  }

  const tick = (ms: number) => { ctx.clock.now = new Date(ctx.clock.now.getTime() + ms); };

  return { app, ctx: ctx as TestContext, call, user, video, tick, db };
}
export type World = ReturnType<typeof world>;
