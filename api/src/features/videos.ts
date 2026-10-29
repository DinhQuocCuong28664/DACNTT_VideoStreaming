/**
 * Watch page, owner edits, deletion and playback: the access rule (access.ts), the CloudFront
 * policy, the AES-128 key, password unlock and the 30-second view rule.
 */
import { ObjectId, type Collection } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import { VISIBILITIES, AUDIENCES, KeyMaterial, keyObject } from '@zelos/shared';
import type { Deps, Feature } from '../app.js';
import { decideAccess, hasMembership, type Access } from '../access.js';
import { badRequest, forbidden, HttpError, notFound } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import { abortDraft } from './uploads.js';
import type { UserDoc } from '../model/user.js';
import type { VideoDoc } from '../model/video.js';

export const CATEGORIES = ['technology', 'education', 'entertainment', 'music', 'gaming', 'other'] as const;
/** A playback grant lasts two hours; the player asks again for longer sessions. */
export const PLAYBACK_TTL_SEC = 2 * 3600;
/** The same viewer counts once per video in this window (as in v1). */
export const VIEW_WINDOW_SEC = 30 * 60;
/** A view counts after this much playback, or the whole video when it is shorter. */
export const VIEW_AFTER_SEC = 30;
const PAGE = 24;

const updateBody = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(30).transform((t) => [...new Set(t)]),
  category: z.enum(CATEGORIES).nullable(),
  visibility: z.enum(VISIBILITIES),
  /** Required when switching to `password`; keeps the old one when omitted. */
  password: z.string().min(4).max(72),
  audience: z.enum(AUDIENCES),
  minTierLevel: z.number().int().min(1).max(5),
  hasViolence: z.boolean(),
}).partial().strict();
const unlockBody = z.object({ password: z.string().min(1).max(72) });
const listQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(PAGE),
  category: z.enum(CATEGORIES).optional(),
});

const parseId = (raw: unknown): ObjectId => {
  const id = String(raw ?? '');
  if (!/^[a-f0-9]{24}$/.test(id)) throw notFound('Video');
  return new ObjectId(id);
};

/** Cursor of a newest-first listing: the sort time and the id of the last item. */
export const encodeCursor = (at: Date, id: ObjectId) => Buffer.from(`${at.getTime()}.${id.toHexString()}`).toString('base64url');
export function decodeCursor(raw: string | undefined): { at: Date; id: ObjectId } | null {
  if (!raw) return null;
  const m = /^(\d{1,15})\.([a-f0-9]{24})$/.exec(Buffer.from(raw, 'base64url').toString());
  if (!m?.[1] || !m[2]) throw badRequest('BAD_CURSOR', 'The page cursor is invalid');
  return { at: new Date(Number(m[1])), id: new ObjectId(m[2]) };
}

export function videoViews(deps: Deps) {
  const users = deps.db.collection<UserDoc>('users');
  const file = (path: string | null) => (path ? deps.cdn.fileUrl(path, deps.now()) : null);

  /** Card in listings: never anything a stranger may not see. */
  const card = (v: VideoDoc, channel?: Pick<UserDoc, 'displayName' | 'handle' | 'avatar'> | null) => ({
    id: v._id.toHexString(),
    title: v.title,
    thumbnail: file(v.customThumbnail ?? v.thumbnail),
    durationSec: v.durationSec,
    views: v.counters.views,
    publishedAt: v.processedAt?.toISOString() ?? null,
    visibility: v.visibility,
    audience: v.audience,
    hasViolence: v.hasViolence,
    channel: { id: v.owner.toHexString(), name: channel?.displayName ?? v.channelName, handle: channel?.handle ?? null, avatar: channel?.avatar ?? null },
  });

  async function cards(list: VideoDoc[]) {
    const owners = [...new Set(list.map((v) => v.owner.toHexString()))].map((id) => new ObjectId(id));
    const found = await users.find({ _id: { $in: owners } }, { projection: { displayName: 1, handle: 1, avatar: 1 } }).toArray();
    const byId = new Map(found.map((u) => [u._id.toHexString(), u]));
    return list.map((v) => card(v, byId.get(v.owner.toHexString())));
  }

  /** Watch page details. Owners and staff also get the processing fields. */
  async function details(v: VideoDoc, access: Access) {
    const id = v._id.toHexString();
    if (access.see === 'stub') return { id, locked: 'password' as const };
    const [base] = await cards([v]);
    return {
      ...base,
      description: v.description,
      tags: v.tags,
      category: v.category,
      counters: { views: v.counters.views, likes: v.counters.likes, comments: v.counters.comments },
      chapters: v.chapters,
      captions: v.captions.map((c) => ({ lang: c.lang, label: c.label })),
      previewVtt: access.play && v.previewVtt ? `${deps.cdn.baseUrl}/${v.previewVtt}` : null,
      locked: access.play ? null : access.lock,
      ...(access.as === 'viewer' ? {} : {
        status: v.status, step: v.step, processingProgress: v.processingProgress, error: v.error,
        moderation: { status: v.moderation.status, reasonCode: v.moderation.reasonCode ?? null },
        publishAt: v.publishAt?.toISOString() ?? null,
      }),
    };
  }
  return { card, cards, details };
}

export const videosFeature: Feature = (r, deps) => {
  const { config, kv, now } = deps;
  const videos = deps.db.collection<VideoDoc>('videos');
  const views = videoViews(deps);
  const limit = (scope: string, max: number, windowSec: number, key?: (req: Request) => string) =>
    rateLimit(kv, config.tables.rateLimits, { scope, limit: max, windowSec, ...(key ? { key } : {}) }, now);

  async function load(req: Request): Promise<{ v: VideoDoc; access: Access }> {
    const v = await videos.findOne({ _id: parseId(req.params['id']) });
    if (!v) throw notFound('Video');
    const unlockToken = req.get('x-unlock-token');
    const access = await decideAccess({
      video: v,
      viewer: req.user,
      unlocked: unlockToken ? deps.tokens.verifyUnlock(unlockToken, v._id.toHexString()) : false,
      isMember: () => hasMembership(deps.db, req.user?.id, v.owner, now(), v.minTierLevel ?? 1),
    });
    return { v, access };
  }

  r.get('/videos', async (req, res) => {
    const q = listQuery.parse(req.query);
    const cursor = decodeCursor(q.cursor);
    const filter: Record<string, unknown> = { status: 'READY', visibility: 'public', 'moderation.status': 'approved' };
    if (q.category) filter['category'] = q.category;
    if (cursor) filter['$or'] = [{ processedAt: { $lt: cursor.at } }, { processedAt: cursor.at, _id: { $lt: cursor.id } }];
    const list = await videos.find(filter).sort({ processedAt: -1, _id: -1 }).limit(q.limit + 1).toArray();
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    res.json({ items: await views.cards(page), nextCursor: list.length > q.limit && last?.processedAt ? encodeCursor(last.processedAt, last._id) : null });
  });

  r.get('/videos/:id', async (req, res) => {
    const { v, access } = await load(req);
    res.json({ video: await views.details(v, access) });
  });

  r.post('/videos/:id/unlock', limit('unlock', 10, 15 * 60, (req) => `ip:${req.clientKey}#${String(req.params['id'])}`), async (req, res) => {
    const { password } = unlockBody.parse(req.body);
    const v = await videos.findOne({ _id: parseId(req.params['id']) }, { projection: { passwordHash: 1, visibility: 1, status: 1 } });
    if (!v || v.status !== 'READY' || v.visibility !== 'password') throw notFound('Video');
    // The answer never includes the title, right or wrong.
    if (!(await deps.passwords.verify(password, v.passwordHash))) throw forbidden('WRONG_PASSWORD', 'The password is wrong');
    res.json({ unlockToken: deps.tokens.unlock(v._id.toHexString()) });
  });

  r.get('/videos/:id/playback', async (req, res) => {
    const { v, access } = await load(req);
    if (!access.play || !v.hlsPath) {
      const lock = access.play ? 'not_ready' : access.lock;
      const codes = new Map([['password', 'PASSWORD_REQUIRED'], ['members', 'MEMBERS_ONLY'], ['removed', 'VIDEO_REMOVED'], ['not_ready', 'VIDEO_NOT_READY']]);
      throw forbidden(codes.get(lock) ?? 'FORBIDDEN', 'This video cannot be played');
    }
    const id = v._id.toHexString();
    const expiresAt = new Date(now().getTime() + PLAYBACK_TTL_SEC * 1000);
    res.json({
      masterUrl: `${deps.cdn.baseUrl}/${v.hlsPath}`,
      cdnQuery: deps.cdn.videoPolicy(id, expiresAt),
      playbackToken: deps.tokens.playback(id, v.uploadVersion, req.user?.id ?? null),
      expiresAt: expiresAt.toISOString(),
      captions: v.captions.map((c) => ({ lang: c.lang, label: c.label, url: `${deps.cdn.baseUrl}/${c.path}` })),
    });
  });

  r.get('/videos/:id/key', async (req, res) => {
    // Only the web app may fetch keys; any other origin is refused instead of failing later.
    const origin = req.get('origin');
    if (origin !== undefined && !config.webOrigins.includes(origin)) throw forbidden('ORIGIN_NOT_ALLOWED', 'This origin may not fetch keys');
    const id = parseId(req.params['id']).toHexString();
    const version = Number(req.query['v']);
    const grant = deps.tokens.verifyPlayback(req.get('x-playback-token') ?? '', id);
    if (!grant || !Number.isInteger(version) || grant.v !== version) throw new HttpError(401, 'PLAYBACK_EXPIRED', 'Start playback again');

    // The same rule as /playback, for the viewer the grant was issued to.
    const v = await videos.findOne({ _id: new ObjectId(id) });
    if (!v || v.uploadVersion !== version) throw notFound('Video');
    const viewer = grant.u ? await deps.sessions.get(grant.u) : null;
    const access = await decideAccess({
      video: v,
      viewer: viewer && !viewer.disabled ? { id: grant.u, role: viewer.role } : undefined,
      // Password and membership were checked when the grant was issued.
      unlocked: true,
      isMember: async () => true,
    });
    if (!access.play) throw forbidden('FORBIDDEN', 'This video cannot be played');

    const raw = await deps.storage.get(config.buckets.keys, keyObject(id, version));
    if (!raw) throw notFound('Key');
    const key = Buffer.from(KeyMaterial.parse(JSON.parse(raw.toString('utf8'))).keyHex, 'hex');
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('application/octet-stream').send(key);
  });

  r.post('/videos/:id/view', limit('view', 60, 3600), async (req, res) => {
    const id = parseId(req.params['id']).toHexString();
    const grant = deps.tokens.verifyPlayback(req.get('x-playback-token') ?? '', id);
    if (!grant) throw new HttpError(401, 'PLAYBACK_EXPIRED', 'Start playback again');
    const v = await videos.findOne({ _id: new ObjectId(id) }, { projection: { owner: 1, status: 1, moderation: 1, durationSec: 1, counters: 1 } });
    if (!v) throw notFound('Video');
    const viewerId = req.user?.id ?? (grant.u || null);
    const playedSec = now().getTime() / 1000 - grant.iat;
    const needed = Math.min(VIEW_AFTER_SEC, Math.max(1, Math.floor(v.durationSec ?? VIEW_AFTER_SEC)));
    const countable = v.status === 'READY' && v.moderation.status === 'approved' && viewerId !== v.owner.toHexString() && playedSec >= needed;
    if (!countable) return void res.json({ counted: false, views: v.counters.views });
    const viewer = viewerId ? `u:${viewerId}` : `ip:${req.clientKey}`;
    const fresh = await kv.markOnce(config.tables.viewMarks, `${viewer}#${id}`, new Date(now().getTime() + VIEW_WINDOW_SEC * 1000), now());
    if (!fresh) return void res.json({ counted: false, views: v.counters.views });
    const after = await videos.findOneAndUpdate({ _id: v._id }, { $inc: { 'counters.views': 1 } }, { returnDocument: 'after', projection: { counters: 1 } });
    // Hourly row for the daily views of creator analytics; kept a week until the roll-up reads it.
    await deps.activity.heartbeats.view(now().toISOString().slice(0, 13), id, new Date(now().getTime() + 7 * 86_400_000));
    res.json({ counted: true, views: after?.counters.views ?? v.counters.views + 1 });
  });

  r.patch('/videos/:id', requireUser, async (req, res) => {
    const body = updateBody.parse(req.body);
    const v = await ownVideo(videos, req);
    const set: Record<string, unknown> = { updatedAt: now() };
    for (const k of ['title', 'description', 'tags', 'category', 'visibility', 'audience', 'minTierLevel', 'hasViolence'] as const) {
      // eslint-disable-next-line security/detect-object-injection -- k comes from the fixed list above
      if (body[k] !== undefined) set[k] = body[k];
    }
    if (body.password !== undefined) set['passwordHash'] = await deps.passwords.hash(body.password);
    if (body.visibility === 'password' && !v.passwordHash && body.password === undefined) {
      throw badRequest('PASSWORD_REQUIRED', 'Set a password for a password-protected video');
    }
    if (body.audience === 'members') {
      const tiers = await deps.db.collection('membershipTiers').countDocuments({ channel: v.owner });
      if (tiers === 0) throw badRequest('NO_TIERS', 'Create a membership tier first');
    }
    const owner = await deps.db.collection<UserDoc>('users').findOne({ _id: v.owner }, { projection: { displayName: 1 } });
    if (owner) set['channelName'] = owner.displayName;
    const after = await videos.findOneAndUpdate({ _id: v._id }, { $set: set }, { returnDocument: 'after' });
    if (!after) throw notFound('Video');
    const access = await decideAccess({ video: after, viewer: req.user, unlocked: true, isMember: async () => true });
    res.json({ video: await views.details(after, access) });
  });

  r.delete('/videos/:id', requireUser, async (req, res) => {
    const v = await ownVideo(videos, req);
    if (v.status === 'UPLOADING') {
      await abortDraft(deps, v);
      return void res.status(204).end();
    }
    // The document goes first, so nobody can open the video while its files are removed.
    await videos.deleteOne({ _id: v._id });
    const id = v._id.toHexString();
    await Promise.all([
      deps.db.collection('comments').deleteMany({ video: v._id }),
      deps.db.collection('reactions').deleteMany({ video: v._id }),
      deps.db.collection('playlists').updateMany({ 'items.video': v._id }, { $pull: { items: { video: v._id } } } as never),
    ]);
    const removed = await Promise.allSettled([
      deps.storage.deletePrefix(config.buckets.raw, `raw/${id}/`),
      deps.storage.deletePrefix(config.buckets.processed, `videos/${id}/`),
      deps.storage.deletePrefix(config.buckets.keys, `keys/${id}/`),
    ]);
    for (const r of removed) if (r.status === 'rejected') deps.log({ level: 'error', msg: 'file clean-up failed', videoId: id, error: String(r.reason) });
    res.status(204).end();
  });
};

async function ownVideo(videos: Collection<VideoDoc>, req: Request): Promise<VideoDoc> {
  const v = await videos.findOne({ _id: parseId(req.params['id']) });
  if (!v || v.owner.toHexString() !== req.user?.id) throw notFound('Video');
  return v;
}
