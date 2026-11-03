/**
 * The viewer's library: resume position and watch history (DynamoDB), analytics heartbeats,
 * watch later and playlists (MongoDB), and the subscriptions feed.
 */
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import type { Feature } from '../app.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import { RETENTION_BUCKETS } from '../services/activity.js';
import type { VideoDoc } from '../model/video.js';
import { decodeCursor, encodeCursor, videoViews } from './videos.js';

export interface PlaylistDoc {
  _id: ObjectId;
  owner: ObjectId;
  kind: 'custom' | 'watch_later';
  title: string;
  description: string;
  visibility: 'public' | 'unlisted' | 'private';
  items: { video: ObjectId; addedAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

/** Players send one heartbeat a minute; each counts at most this much watch time. */
export const HEARTBEAT_SEC = 60;
export const MAX_PLAYLIST_ITEMS = 5000;
const HEARTBEAT_TTL_DAYS = 7;

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const heartbeatBody = z.object({
  positionSec: z.number().min(0).max(48 * 3600),
  watchedSec: z.number().min(0).max(3600),
});
const playlistBody = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().max(5000).default(''),
  visibility: z.enum(['public', 'unlisted', 'private']).default('private'),
});
const pageQuery = z.object({ cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(50).default(24) });

/** Public ready videos anyone may see in a list. */
const listable = (v: VideoDoc | undefined) =>
  Boolean(v && v.status === 'READY' && v.visibility !== 'private' && v.moderation.status === 'approved');

export const libraryFeature: Feature = (r, deps) => {
  const { db, now, kv, config, activity } = deps;
  const videos = db.collection<VideoDoc>('videos');
  const playlists = db.collection<PlaylistDoc>('playlists');
  const views = videoViews(deps);
  const me = (req: Request) => new ObjectId(req.user?.id);

  async function videosById(ids: ObjectId[]) {
    const list = ids.length ? await videos.find({ _id: { $in: ids } }).toArray() : [];
    return new Map(list.map((v) => [v._id.toHexString(), v]));
  }

  // Heartbeats, resume and history -----------------------------------------------------------

  r.post('/videos/:id/heartbeat', async (req, res) => {
    const body = heartbeatBody.parse(req.body);
    const id = objectId.parse(String(req.params['id']));
    const grant = deps.tokens.verifyPlayback(req.get('x-playback-token') ?? '', id);
    if (!grant) throw new HttpError(401, 'PLAYBACK_EXPIRED', 'Start playback again');
    const t = now();
    const viewer = req.user ? `u:${req.user.id}` : `ip:${req.clientKey}`;
    const minute = Math.floor(t.getTime() / (HEARTBEAT_SEC * 1000));
    // One beat per viewer, video and minute: a client cannot add more watch time than real time.
    const counted = await kv.markOnce(config.tables.rateLimits, `hb#${viewer}#${id}#${minute}`, new Date((minute + 2) * HEARTBEAT_SEC * 1000), t);
    if (counted) {
      const v = await videos.findOne({ _id: new ObjectId(id) }, { projection: { durationSec: 1, owner: 1 } });
      if (v && v.owner.toHexString() !== req.user?.id) {
        const duration = v.durationSec ?? 0;
        const bucket = duration > 0 ? Math.min(RETENTION_BUCKETS - 1, Math.floor((body.positionSec / duration) * RETENTION_BUCKETS)) : 0;
        const hour = t.toISOString().slice(0, 13);
        await activity.heartbeats.add(hour, id, Math.min(body.watchedSec, HEARTBEAT_SEC), bucket, new Date(t.getTime() + HEARTBEAT_TTL_DAYS * 86_400_000));
      }
    }
    if (req.user) {
      await activity.watch.put(req.user.id, { videoId: id, positionSec: Math.floor(body.positionSec), durationSec: 0, updatedAt: t.toISOString() });
    }
    res.status(202).json({ counted });
  });

  r.get('/me/progress/:videoId', requireUser, async (req, res) => {
    const p = await activity.watch.get(req.user?.id ?? '', objectId.parse(String(req.params['videoId'])));
    res.json({ positionSec: p?.positionSec ?? 0 });
  });

  r.get('/me/history', requireUser, async (req, res) => {
    const q = pageQuery.parse(req.query);
    const page = await activity.watch.history(req.user?.id ?? '', q.limit, q.cursor ?? null);
    const byId = await videosById(page.items.map((p) => new ObjectId(p.videoId)));
    const visible = page.items.flatMap((p) => { const v = byId.get(p.videoId); return v && listable(v) ? [{ p, v }] : []; });
    const cards = await views.cards(visible.map((x) => x.v));
    res.json({ items: cards.map((c, i) => ({ ...c, positionSec: visible.at(i)?.p.positionSec ?? 0, watchedAt: visible.at(i)?.p.updatedAt })), nextCursor: page.next });
  });

  r.delete('/me/history/:videoId', requireUser, async (req, res) => {
    await activity.watch.remove(req.user?.id ?? '', objectId.parse(String(req.params['videoId'])));
    res.status(204).end();
  });

  r.delete('/me/history', requireUser, async (req, res) => {
    res.json({ removed: await activity.watch.clear(req.user?.id ?? '') });
  });

  // Subscriptions feed ------------------------------------------------------------------------

  r.get('/me/feed', requireUser, async (req, res) => {
    const q = pageQuery.parse(req.query);
    const channels = (await db.collection('subscriptions').find({ subscriber: me(req) }, { projection: { channel: 1 } }).limit(500).toArray()).map((s) => s['channel'] as ObjectId);
    const cursor = decodeCursor(q.cursor);
    const filter: Record<string, unknown> = { owner: { $in: channels }, status: 'READY', visibility: 'public', 'moderation.status': 'approved' };
    if (cursor) filter['$or'] = [{ processedAt: { $lt: cursor.at } }, { processedAt: cursor.at, _id: { $lt: cursor.id } }];
    const list = channels.length ? await videos.find(filter).sort({ processedAt: -1, _id: -1 }).limit(q.limit + 1).toArray() : [];
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    res.json({ items: await views.cards(page), nextCursor: list.length > q.limit && last?.processedAt ? encodeCursor(last.processedAt, last._id) : null });
  });

  // Playlists and watch later -----------------------------------------------------------------

  async function watchLater(owner: ObjectId): Promise<PlaylistDoc> {
    const at = now();
    try {
      const p = await playlists.findOneAndUpdate(
        { owner, kind: 'watch_later' },
        { $setOnInsert: { _id: new ObjectId(), title: 'Watch later', description: '', visibility: 'private', items: [], createdAt: at, updatedAt: at } },
        { upsert: true, returnDocument: 'after' },
      );
      if (p) return p;
    } catch (err) {
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
    }
    const p = await playlists.findOne({ owner, kind: 'watch_later' });
    if (!p) throw new Error('watch later playlist missing');
    return p;
  }

  /** `watch-later` names the caller's system playlist; anything else is an id. */
  async function playlistFor(req: Request): Promise<PlaylistDoc> {
    const ref = String(req.params['id'] ?? '');
    if (ref === 'watch-later') {
      if (!req.user) throw notFound('Playlist');
      return watchLater(me(req));
    }
    const p = /^[a-f0-9]{24}$/.test(ref) ? await playlists.findOne({ _id: new ObjectId(ref) }) : null;
    if (!p) throw notFound('Playlist');
    return p;
  }

  async function ownPlaylist(req: Request): Promise<PlaylistDoc> {
    const p = await playlistFor(req);
    if (p.owner.toHexString() !== req.user?.id) throw notFound('Playlist');
    return p;
  }

  const summary = (p: PlaylistDoc) => ({
    id: p.kind === 'watch_later' ? 'watch-later' : p._id.toHexString(),
    kind: p.kind, title: p.title, description: p.description, visibility: p.visibility,
    count: p.items.length, updatedAt: p.updatedAt.toISOString(), owner: p.owner.toHexString(),
  });

  r.get('/me/playlists', requireUser, async (req, res) => {
    await watchLater(me(req));
    const list = await playlists.find({ owner: me(req) }).sort({ kind: -1, updatedAt: -1 }).limit(200).toArray();
    res.json({ items: list.map(summary) });
  });

  r.post('/me/playlists', requireUser, rateLimit(kv, config.tables.rateLimits, { scope: 'playlist', limit: 30, windowSec: 3600 }, now), async (req, res) => {
    const body = playlistBody.parse(req.body);
    const at = now();
    const doc: PlaylistDoc = { _id: new ObjectId(), owner: me(req), kind: 'custom', ...body, items: [], createdAt: at, updatedAt: at };
    await playlists.insertOne(doc);
    res.status(201).json({ playlist: summary(doc) });
  });

  r.get('/playlists/:id', async (req, res) => {
    const p = await playlistFor(req);
    const mine = p.owner.toHexString() === req.user?.id;
    if (p.visibility === 'private' && !mine) throw notFound('Playlist');
    const byId = await videosById(p.items.map((i) => i.video));
    const items = await Promise.all(p.items.map(async (i) => {
      const v = byId.get(i.video.toHexString());
      // Deleted or hidden videos keep their place but reveal nothing.
      if (!v || !(listable(v) || (mine && v.owner.equals(p.owner)))) return { id: i.video.toHexString(), unavailable: true, addedAt: i.addedAt.toISOString() };
      const [card] = await views.cards([v]);
      return { ...card, unavailable: false, addedAt: i.addedAt.toISOString() };
    }));
    res.json({ playlist: summary(p), items });
  });

  r.patch('/playlists/:id', requireUser, async (req, res) => {
    const body = playlistBody.partial().parse(req.body);
    const p = await ownPlaylist(req);
    if (p.kind === 'watch_later') throw forbidden('SYSTEM_PLAYLIST', 'Watch later cannot be renamed or shared');
    const after = await playlists.findOneAndUpdate({ _id: p._id }, { $set: { ...body, updatedAt: now() } }, { returnDocument: 'after' });
    res.json({ playlist: summary(after ?? p) });
  });

  r.delete('/playlists/:id', requireUser, async (req, res) => {
    const p = await ownPlaylist(req);
    if (p.kind === 'watch_later') throw forbidden('SYSTEM_PLAYLIST', 'Watch later cannot be deleted');
    await playlists.deleteOne({ _id: p._id });
    res.status(204).end();
  });

  r.post('/playlists/:id/items', requireUser, async (req, res) => {
    const videoId = new ObjectId(objectId.parse((req.body as { videoId?: unknown } | undefined)?.videoId));
    const p = await ownPlaylist(req);
    const v = await videos.findOne({ _id: videoId });
    if (!v || !(listable(v) || v.owner.equals(me(req)))) throw notFound('Video');
    // The filter refuses duplicates and full lists in the same write.
    const done = await playlists.updateOne(
      { _id: p._id, 'items.video': { $ne: videoId }, [`items.${MAX_PLAYLIST_ITEMS - 1}`]: { $exists: false } },
      { $push: { items: { video: videoId, addedAt: now() } }, $set: { updatedAt: now() } },
    );
    if (done.modifiedCount === 0) {
      const again = await playlists.findOne({ _id: p._id, 'items.video': videoId }, { projection: { _id: 1 } });
      if (again) throw conflict('ALREADY_IN_PLAYLIST', 'This video is already in the playlist');
      throw conflict('PLAYLIST_FULL', `A playlist holds up to ${MAX_PLAYLIST_ITEMS} videos`);
    }
    res.status(201).json({ added: true });
  });

  r.delete('/playlists/:id/items/:videoId', requireUser, async (req, res) => {
    const videoId = new ObjectId(objectId.parse(String(req.params['videoId'])));
    const p = await ownPlaylist(req);
    await playlists.updateOne({ _id: p._id }, { $pull: { items: { video: videoId } }, $set: { updatedAt: now() } });
    res.status(204).end();
  });

  r.put('/playlists/:id/order', requireUser, async (req, res) => {
    const order = z.object({ videoIds: z.array(objectId).max(MAX_PLAYLIST_ITEMS) }).parse(req.body).videoIds;
    const p = await ownPlaylist(req);
    const current = new Map(p.items.map((i) => [i.video.toHexString(), i]));
    if (order.length !== current.size || new Set(order).size !== order.length || !order.every((id) => current.has(id))) {
      throw badRequest('ORDER_MISMATCH', 'Send every video of the playlist exactly once');
    }
    const items = order.map((id) => current.get(id) as PlaylistDoc['items'][number]);
    // Only applies if nobody changed the list since it was read.
    const done = await playlists.updateOne({ _id: p._id, updatedAt: p.updatedAt }, { $set: { items, updatedAt: now() } });
    if (done.modifiedCount === 0) throw conflict('PLAYLIST_CHANGED', 'The playlist changed; reload and try again');
    res.status(204).end();
  });
};
