/**
 * Reactions, comments (one reply level, pinned first) and comment reports. Every counter is
 * recomputed with countDocuments after a change, so concurrent writes never drift (§5.8a).
 */
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import type { Feature } from '../app.js';
import { decideAccess, hasMembership } from '../access.js';
import { can } from '../auth/tokens.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import { MAX_REPORT_DETAILS, REPORT_REASONS } from '../model/moderation.js';
import type { UserDoc } from '../model/user.js';
import type { VideoDoc } from '../model/video.js';
import { decodeCursor, encodeCursor } from './videos.js';

export interface CommentDoc {
  _id: ObjectId;
  video: ObjectId;
  author: ObjectId;
  /** Top-level comment this replies to, or null. Replies to replies attach to the same parent. */
  parent: ObjectId | null;
  body: string;
  pinned: boolean;
  replyCount: number;
  openReports: number;
  createdAt: Date;
}

const MAX_COMMENT = 1000;
const PAGE = 20;

const reactionBody = z.object({ kind: z.enum(['like', 'dislike']).nullable() });
const commentBody = z.object({ body: z.string().trim().min(1).max(MAX_COMMENT), parentId: z.string().regex(/^[a-f0-9]{24}$/).optional() });
const pageQuery = z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(50).default(PAGE) });
const reportBody = z.object({ reason: z.enum(REPORT_REASONS), details: z.string().trim().max(MAX_REPORT_DETAILS).default('') });

const oid = (raw: unknown, what: string): ObjectId => {
  const s = String(raw ?? '');
  if (!/^[a-f0-9]{24}$/.test(s)) throw notFound(what);
  return new ObjectId(s);
};

export const communityFeature: Feature = (r, deps) => {
  const { db, now, kv, config } = deps;
  const videos = db.collection<VideoDoc>('videos');
  const comments = db.collection<CommentDoc>('comments');
  const reactions = db.collection('reactions');
  const reports = db.collection('commentReports');
  const users = db.collection<UserDoc>('users');
  const commentLimit = rateLimit(kv, config.tables.rateLimits, { scope: 'comment', limit: 10, windowSec: 60 }, now);

  /** Loads a video the requester may play; comments and reactions follow the same rule. */
  async function playableVideo(req: Request, id: ObjectId): Promise<VideoDoc> {
    const v = await videos.findOne({ _id: id });
    if (!v) throw notFound('Video');
    const unlock = req.get('x-unlock-token');
    const access = await decideAccess({
      video: v, viewer: req.user,
      unlocked: unlock ? deps.tokens.verifyUnlock(unlock, v._id.toHexString()) : false,
      isMember: () => hasMembership(db, req.user?.id, v.owner, now(), v.minTierLevel ?? 1),
    });
    if (!access.play && access.as === 'viewer') throw forbidden('VIDEO_LOCKED', 'Unlock the video to see its comments');
    return v;
  }

  async function syncCounts(videoId: ObjectId, parent: ObjectId | null) {
    const tasks: Promise<unknown>[] = [
      comments.countDocuments({ video: videoId }).then((n) => videos.updateOne({ _id: videoId }, { $set: { 'counters.comments': n } })),
    ];
    if (parent) tasks.push(comments.countDocuments({ parent }).then((n) => comments.updateOne({ _id: parent }, { $set: { replyCount: n } })));
    await Promise.all(tasks);
  }

  async function views(list: CommentDoc[], videoOwner: ObjectId) {
    const authors = await users.find({ _id: { $in: [...new Set(list.map((c) => c.author.toHexString()))].map((s) => new ObjectId(s)) } }, { projection: { displayName: 1, handle: 1, avatar: 1 } }).toArray();
    const byId = new Map(authors.map((u) => [u._id.toHexString(), u]));
    return list.map((c) => {
      const a = byId.get(c.author.toHexString());
      return {
        id: c._id.toHexString(),
        body: c.body,
        parentId: c.parent?.toHexString() ?? null,
        pinned: c.pinned,
        replyCount: c.replyCount,
        createdAt: c.createdAt.toISOString(),
        byCreator: c.author.equals(videoOwner),
        author: a ? { id: a._id.toHexString(), name: a.displayName, handle: a.handle, avatar: a.avatar } : { id: c.author.toHexString(), name: 'Deleted user', handle: null, avatar: null },
      };
    });
  }

  // Reactions ---------------------------------------------------------------------------------

  r.get('/videos/:id/reaction', requireUser, async (req, res) => {
    const mine = await reactions.findOne({ video: oid(req.params['id'], 'Video'), user: new ObjectId(req.user?.id) });
    res.json({ kind: mine?.['kind'] ?? null });
  });

  r.put('/videos/:id/reaction', requireUser, async (req, res) => {
    const { kind } = reactionBody.parse(req.body);
    const v = await playableVideo(req, oid(req.params['id'], 'Video'));
    const key = { video: v._id, user: new ObjectId(req.user?.id) };
    if (kind) await reactions.updateOne(key, { $set: { kind, updatedAt: now() } }, { upsert: true });
    else await reactions.deleteOne(key);
    const [likes, dislikes] = await Promise.all([
      reactions.countDocuments({ video: v._id, kind: 'like' }),
      reactions.countDocuments({ video: v._id, kind: 'dislike' }),
    ]);
    await videos.updateOne({ _id: v._id }, { $set: { 'counters.likes': likes, 'counters.dislikes': dislikes } });
    res.json({ kind, likes });
  });

  // Comments ----------------------------------------------------------------------------------

  r.get('/videos/:id/comments', async (req, res) => {
    const q = pageQuery.parse(req.query);
    const v = await playableVideo(req, oid(req.params['id'], 'Video'));
    const cursor = decodeCursor(q.cursor);
    // Pinned comment heads the first page and is skipped afterwards.
    const pinned = cursor ? [] : await comments.find({ video: v._id, parent: null, pinned: true }).limit(1).toArray();
    const filter: Record<string, unknown> = { video: v._id, parent: null, pinned: false };
    if (cursor) filter['_id'] = { $lt: cursor.id };
    const list = await comments.find(filter).sort({ _id: -1 }).limit(q.limit + 1).toArray();
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    res.json({
      items: await views([...pinned, ...page], v.owner),
      nextCursor: list.length > q.limit && last ? encodeCursor(last.createdAt, last._id) : null,
      total: v.counters.comments,
    });
  });

  r.get('/comments/:id/replies', async (req, res) => {
    const q = pageQuery.parse(req.query);
    const parent = await comments.findOne({ _id: oid(req.params['id'], 'Comment'), parent: null });
    if (!parent) throw notFound('Comment');
    const v = await playableVideo(req, parent.video);
    const cursor = decodeCursor(q.cursor);
    const filter: Record<string, unknown> = { parent: parent._id };
    if (cursor) filter['_id'] = { $gt: cursor.id };
    const list = await comments.find(filter).sort({ _id: 1 }).limit(q.limit + 1).toArray();
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    res.json({ items: await views(page, v.owner), nextCursor: list.length > q.limit && last ? encodeCursor(last.createdAt, last._id) : null });
  });

  r.post('/videos/:id/comments', requireUser, commentLimit, async (req, res) => {
    const body = commentBody.parse(req.body);
    const v = await playableVideo(req, oid(req.params['id'], 'Video'));
    let parent: ObjectId | null = null;
    if (body.parentId) {
      const p = await comments.findOne({ _id: new ObjectId(body.parentId), video: v._id });
      if (!p) throw badRequest('PARENT_NOT_FOUND', 'The comment you reply to no longer exists');
      parent = p.parent ?? p._id;
    }
    const doc: CommentDoc = { _id: new ObjectId(), video: v._id, author: new ObjectId(req.user?.id), parent, body: body.body, pinned: false, replyCount: 0, openReports: 0, createdAt: now() };
    await comments.insertOne(doc);
    await syncCounts(v._id, parent);
    const [view] = await views([doc], v.owner);
    res.status(201).json({ comment: view });
  });

  r.delete('/comments/:id', requireUser, async (req, res) => {
    const c = await comments.findOne({ _id: oid(req.params['id'], 'Comment') });
    if (!c) throw notFound('Comment');
    const v = await videos.findOne({ _id: c.video }, { projection: { owner: 1 } });
    const me = req.user;
    const allowed = me && (c.author.toHexString() === me.id || v?.owner.toHexString() === me.id || can(me.role, 'moderation:review'));
    if (!allowed) throw forbidden();
    // A thread goes with its replies.
    await comments.deleteMany({ $or: [{ _id: c._id }, { parent: c._id }] });
    await reports.updateMany({ comment: c._id, status: 'open' }, { $set: { status: 'actioned', resolvedAt: now(), commentText: c.body, commentAuthor: c.author } });
    await syncCounts(c.video, c.parent);
    res.status(204).end();
  });

  async function setPin(req: Request, pinned: boolean) {
    const c = await comments.findOne({ _id: oid(req.params['id'], 'Comment'), parent: null });
    if (!c) throw notFound('Comment');
    const v = await videos.findOne({ _id: c.video }, { projection: { owner: 1 } });
    if (!v || v.owner.toHexString() !== req.user?.id) throw forbidden('NOT_CREATOR', 'Only the creator can pin comments');
    if (pinned) await comments.updateMany({ video: c.video, pinned: true }, { $set: { pinned: false } });
    await comments.updateOne({ _id: c._id }, { $set: { pinned } });
  }
  r.put('/comments/:id/pin', requireUser, async (req, res) => { await setPin(req, true); res.status(204).end(); });
  r.delete('/comments/:id/pin', requireUser, async (req, res) => { await setPin(req, false); res.status(204).end(); });

  r.post('/comments/:id/report', requireUser, rateLimit(kv, config.tables.rateLimits, { scope: 'report', limit: 20, windowSec: 3600 }, now), async (req, res) => {
    const body = reportBody.parse(req.body);
    const c = await comments.findOne({ _id: oid(req.params['id'], 'Comment') });
    if (!c) throw notFound('Comment');
    if (c.author.toHexString() === req.user?.id) throw badRequest('OWN_COMMENT', 'You cannot report your own comment');
    await playableVideo(req, c.video);
    try {
      await reports.insertOne({ comment: c._id, video: c.video, reporter: new ObjectId(req.user?.id), reason: body.reason, details: body.details, status: 'open', createdAt: now() });
    } catch (err) {
      // One open report per person and comment; a repeat changes nothing.
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
      return void res.status(200).json({ reported: true, repeated: true });
    }
    const open = await reports.countDocuments({ comment: c._id, status: 'open' });
    await comments.updateOne({ _id: c._id }, { $set: { openReports: open } });
    res.status(201).json({ reported: true, repeated: false });
  });
};
