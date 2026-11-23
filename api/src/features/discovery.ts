/** Search, autocomplete, related videos, trending, "not interested" and the notification inbox. */
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Feature } from '../app.js';
import { notFound } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import { publicView, type UserDoc } from '../model/user.js';
import type { VideoDoc } from '../model/video.js';
import { CATEGORIES, dismissedIds, videoViews } from './videos.js';

export const SEARCH_PAGE = 20;
const MAX_PAGES = 10;

const searchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(MAX_PAGES).default(1),
  category: z.enum(CATEGORIES).optional(),
});
const suggestQuery = z.object({ q: z.string().trim().max(100) });
const markBody = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(100) });
const pageQuery = z.object({ cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });

/** Ready, public, approved: the same rule as the search filter, checked again after loading. */
const listable = (v: VideoDoc) => v.status === 'READY' && v.visibility === 'public' && v.moderation.status === 'approved';

/** Trending ranks among this many of the newest public videos, and shows this many. */
export const TRENDING_POOL = 500;
export const TRENDING_SIZE = 50;
/**
 * Trending score: views divided by age raised to a gravity, the formula Hacker News made known.
 * A video gains while views come faster than time passes and sinks as it gets older; two hours
 * are added so a video minutes old does not divide by almost nothing.
 */
export const TRENDING_GRAVITY = 1.5;
export const trendingScore = (views: number, ageHours: number) => views / (Math.max(ageHours, 0) + 2) ** TRENDING_GRAVITY;
const videoIdParam = z.string().regex(/^[a-f0-9]{24}$/);

export const discoveryFeature: Feature = (r, deps) => {
  const { db, search, kv, config, now, activity } = deps;
  const videos = db.collection<VideoDoc>('videos');
  const users = db.collection<UserDoc>('users');
  const cards = videoViews(deps).cards;
  const searchLimit = rateLimit(kv, config.tables.rateLimits, { scope: 'search', limit: 60, windowSec: 60 }, now);

  r.get('/search', searchLimit, async (req, res) => {
    const q = searchQuery.parse(req.query);
    const [hits, channelIds] = await Promise.all([
      search.videos(q.q, { skip: (q.page - 1) * SEARCH_PAGE, limit: SEARCH_PAGE + 1, ...(q.category ? { category: q.category } : {}) }),
      q.page === 1 ? search.channels(q.q, 3) : Promise.resolve([]),
    ]);
    const ids = hits.slice(0, SEARCH_PAGE).map((h) => new ObjectId(h.id));
    const found = new Map((await videos.find({ _id: { $in: ids } }).toArray()).map((v) => [v._id.toHexString(), v]));
    const ordered = ids.flatMap((id) => { const v = found.get(id.toHexString()); return v && listable(v) ? [v] : []; });
    const channels = channelIds.length ? await users.find({ _id: { $in: channelIds.map((id) => new ObjectId(id)) }, disabled: false }).toArray() : [];
    res.json({ items: await cards(ordered), channels: channels.map(publicView), nextPage: hits.length > SEARCH_PAGE && q.page < MAX_PAGES ? q.page + 1 : null });
  });

  r.get('/search/suggest', searchLimit, async (req, res) => {
    const { q } = suggestQuery.parse(req.query);
    // Autocomplete starts after two characters.
    res.json({ items: q.length < 2 ? [] : await search.suggest(q, 8) });
  });

  r.get('/videos/:id/related', async (req, res) => {
    const id = String(req.params['id'] ?? '');
    const v = /^[a-f0-9]{24}$/.test(id) ? await videos.findOne({ _id: new ObjectId(id) }) : null;
    if (!v || !listable(v)) throw notFound('Video');
    const hidden = await dismissedIds(db, req.user?.id);
    const base = { _id: { $nin: [v._id, ...hidden] }, status: 'READY', visibility: 'public', 'moderation.status': 'approved' } as const;
    const or: Record<string, unknown>[] = [{ owner: v.owner }];
    if (v.category) or.push({ category: v.category });
    if (v.tags.length) or.push({ tags: { $in: v.tags } });
    let list = await videos.find({ ...base, $or: or }).sort({ 'counters.views': -1 }).limit(12).toArray();
    if (list.length < 12) {
      const more = await videos.find({ ...base, _id: { $nin: [v._id, ...hidden, ...list.map((x) => x._id)] } }).sort({ processedAt: -1 }).limit(12 - list.length).toArray();
      list = [...list, ...more];
    }
    res.json({ items: await cards(list) });
  });

  r.get('/trending', async (req, res) => {
    const hidden = await dismissedIds(db, req.user?.id);
    const pool = await videos.find({ status: 'READY', visibility: 'public', 'moderation.status': 'approved', ...(hidden.length ? { _id: { $nin: hidden } } : {}) })
      .sort({ processedAt: -1, _id: -1 }).limit(TRENDING_POOL).toArray();
    const at = now().getTime();
    const ranked = pool
      .map((v) => ({ v, score: trendingScore(v.counters.views, (at - (v.processedAt ?? v.createdAt).getTime()) / 3_600_000) }))
      .filter((x) => x.v.counters.views > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TRENDING_SIZE)
      .map((x) => x.v);
    res.json({ items: await cards(ranked) });
  });

  // "Not interested": hides a video from the home feed, related videos and trending of this viewer.
  r.put('/me/not-interested/:videoId', requireUser, async (req, res) => {
    const id = new ObjectId(videoIdParam.parse(String(req.params['videoId'])));
    if (!(await videos.countDocuments({ _id: id }, { limit: 1 }))) throw notFound('Video');
    try {
      await db.collection('dismissals').insertOne({ user: new ObjectId(req.user?.id), video: id, createdAt: now() });
    } catch (err) {
      // Marking twice keeps the first mark.
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
    }
    res.status(204).end();
  });

  r.delete('/me/not-interested/:videoId', requireUser, async (req, res) => {
    const id = new ObjectId(videoIdParam.parse(String(req.params['videoId'])));
    await db.collection('dismissals').deleteOne({ user: new ObjectId(req.user?.id), video: id });
    res.status(204).end();
  });

  r.get('/me/notifications', requireUser, async (req, res) => {
    const q = pageQuery.parse(req.query);
    const userId = req.user?.id ?? '';
    const [page, unread] = await Promise.all([activity.notifications.list(userId, q.limit, q.cursor ?? null), activity.notifications.unread(userId)]);
    res.json({ items: page.items, nextCursor: page.next, unread });
  });

  r.post('/me/notifications/read', requireUser, async (req, res) => {
    const { ids } = markBody.parse(req.body);
    await activity.notifications.markRead(req.user?.id ?? '', ids);
    res.json({ unread: await activity.notifications.unread(req.user?.id ?? '') });
  });
};
