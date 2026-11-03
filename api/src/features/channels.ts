/**
 * Channels (a user's public page, by id or @handle), subscriptions, membership tiers with a
 * sandbox join flow, and the owner's profile settings. Relationship counters are recounted with
 * countDocuments on every change.
 */
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import type { Feature } from '../app.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import { HANDLE_RE, RESERVED_HANDLES, publicView, selfView, type UserDoc } from '../model/user.js';
import type { VideoDoc } from '../model/video.js';
import { decodeCursor, encodeCursor, videoViews } from './videos.js';

export interface TierDoc {
  _id: ObjectId;
  channel: ObjectId;
  name: string;
  /** Monthly price in VND; payment is a sandbox, nothing is charged. */
  price: number;
  level: number;
  perks: string[];
  description: string;
  badgeColor: string;
  active: boolean;
  createdAt: Date;
}

export interface MembershipDoc {
  _id: ObjectId;
  member: ObjectId;
  channel: ObjectId;
  tier: ObjectId;
  level: number;
  startedAt: Date;
  expiresAt: Date;
  /** Cancelled memberships run to the end of the paid period and are not renewed. */
  cancelled: boolean;
}

/** Handles may change twice in fourteen days, as on YouTube. */
export const HANDLE_CHANGES = { max: 2, windowDays: 14 };
const MEMBERSHIP_DAYS = 30;
const MAX_TIERS = 5;

const tierBody = z.object({
  name: z.string().trim().min(1).max(50),
  price: z.number().int().min(0).max(10_000_000),
  level: z.number().int().min(1).max(MAX_TIERS),
  perks: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  description: z.string().max(300).default(''),
  badgeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10a37f'),
});
const profileBody = z.object({
  displayName: z.string().trim().min(1).max(50),
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE),
  description: z.string().max(1000),
  notifyByEmail: z.boolean(),
}).partial().strict();
const joinBody = z.object({ tierId: z.string().regex(/^[a-f0-9]{24}$/) });
const listQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const channelsFeature: Feature = (r, deps) => {
  const { db, now, kv, config } = deps;
  const users = db.collection<UserDoc>('users');
  const videos = db.collection<VideoDoc>('videos');
  const subs = db.collection('subscriptions');
  const tiers = db.collection<TierDoc>('membershipTiers');
  const members = db.collection<MembershipDoc>('memberships');
  const cards = videoViews(deps).cards;

  async function channel(ref: unknown): Promise<UserDoc> {
    const s = String(ref ?? '');
    const filter = /^[a-f0-9]{24}$/.test(s) ? { _id: new ObjectId(s) } : s.startsWith('@') ? { handle: s.slice(1).toLowerCase() } : null;
    const u = filter ? await users.findOne(filter) : null;
    if (!u || u.disabled) throw notFound('Channel');
    return u;
  }

  const meId = (req: Request) => new ObjectId(req.user?.id);

  async function syncSubscribers(channelId: ObjectId): Promise<number> {
    const n = await subs.countDocuments({ channel: channelId });
    await users.updateOne({ _id: channelId }, { $set: { 'counters.subscribers': n } });
    return n;
  }

  async function activeMembership(member: ObjectId, channelId: ObjectId) {
    return members.findOne({ member, channel: channelId, expiresAt: { $gt: now() } });
  }

  const tierView = (t: TierDoc) => ({ id: t._id.toHexString(), name: t.name, price: t.price, currency: 'VND', level: t.level, perks: t.perks, description: t.description, badgeColor: t.badgeColor });
  const membershipView = (m: MembershipDoc | null) => m ? { tierId: m.tier.toHexString(), level: m.level, expiresAt: m.expiresAt.toISOString(), cancelled: m.cancelled } : null;

  // Channel pages -----------------------------------------------------------------------------

  r.get('/channels/:ref', async (req, res) => {
    const c = await channel(req.params['ref']);
    const [subscribed, membership, tierList, videoCount] = await Promise.all([
      req.user ? subs.countDocuments({ subscriber: meId(req), channel: c._id }, { limit: 1 }) : Promise.resolve(0),
      req.user ? activeMembership(meId(req), c._id) : Promise.resolve(null),
      tiers.find({ channel: c._id, active: true }).sort({ level: 1 }).toArray(),
      videos.countDocuments({ owner: c._id, status: 'READY', visibility: 'public', 'moderation.status': 'approved' }),
    ]);
    res.json({
      channel: { ...publicView(c), videos: videoCount },
      viewer: req.user ? { subscribed: subscribed > 0, membership: membershipView(membership), isOwner: req.user.id === c._id.toHexString() } : null,
      tiers: tierList.map(tierView),
    });
  });

  r.get('/channels/:ref/videos', async (req, res) => {
    const q = listQuery.parse(req.query);
    const c = await channel(req.params['ref']);
    const cursor = decodeCursor(q.cursor);
    const filter: Record<string, unknown> = { owner: c._id, status: 'READY', visibility: 'public', 'moderation.status': 'approved' };
    if (cursor) filter['$or'] = [{ processedAt: { $lt: cursor.at } }, { processedAt: cursor.at, _id: { $lt: cursor.id } }];
    const list = await videos.find(filter).sort({ processedAt: -1, _id: -1 }).limit(q.limit + 1).toArray();
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    res.json({ items: await cards(page), nextCursor: list.length > q.limit && last?.processedAt ? encodeCursor(last.processedAt, last._id) : null });
  });

  // Subscriptions -----------------------------------------------------------------------------

  r.put('/channels/:ref/subscription', requireUser, rateLimit(kv, config.tables.rateLimits, { scope: 'subscribe', limit: 60, windowSec: 3600 }, now), async (req, res) => {
    const c = await channel(req.params['ref']);
    if (c._id.equals(meId(req))) throw badRequest('SELF_SUBSCRIBE', 'You cannot subscribe to your own channel');
    await subs.updateOne({ subscriber: meId(req), channel: c._id }, { $setOnInsert: { createdAt: now() } }, { upsert: true }).catch((err: unknown) => {
      // Two parallel requests: the unique index lets one insert; the other is the same result.
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
    });
    res.json({ subscribed: true, subscribers: await syncSubscribers(c._id) });
  });

  r.delete('/channels/:ref/subscription', requireUser, async (req, res) => {
    const c = await channel(req.params['ref']);
    await subs.deleteOne({ subscriber: meId(req), channel: c._id });
    res.json({ subscribed: false, subscribers: await syncSubscribers(c._id) });
  });

  r.get('/me/subscriptions', requireUser, async (req, res) => {
    const list = await subs.find({ subscriber: meId(req) }).sort({ createdAt: -1 }).limit(500).toArray();
    const found = await users.find({ _id: { $in: list.map((s) => s['channel'] as ObjectId) }, disabled: false }).toArray();
    const byId = new Map(found.map((u) => [u._id.toHexString(), u]));
    res.json({ items: list.flatMap((s) => { const u = byId.get(String(s['channel'])); return u ? [publicView(u)] : []; }) });
  });

  // Membership tiers --------------------------------------------------------------------------

  r.post('/me/tiers', requireUser, async (req, res) => {
    const body = tierBody.parse(req.body);
    const channelId = meId(req);
    if ((await tiers.countDocuments({ channel: channelId, active: true })) >= MAX_TIERS) throw conflict('TOO_MANY_TIERS', `At most ${MAX_TIERS} tiers`);
    const doc: TierDoc = { _id: new ObjectId(), channel: channelId, ...body, active: true, createdAt: now() };
    try {
      await tiers.insertOne(doc);
      res.status(201).json({ tier: tierView(doc) });
    } catch (err) {
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
      // Two creates of the same level at once: both read the one that won.
      const winner = await tiers.findOne({ channel: channelId, level: body.level, active: true });
      if (!winner) throw err;
      res.status(200).json({ tier: tierView(winner) });
    }
  });

  r.patch('/me/tiers/:id', requireUser, async (req, res) => {
    const body = tierBody.omit({ level: true }).partial().parse(req.body);
    const id = /^[a-f0-9]{24}$/.test(String(req.params['id'])) ? new ObjectId(String(req.params['id'])) : null;
    const t = id ? await tiers.findOneAndUpdate({ _id: id, channel: meId(req), active: true }, { $set: body }, { returnDocument: 'after' }) : null;
    if (!t) throw notFound('Tier');
    res.json({ tier: tierView(t) });
  });

  r.delete('/me/tiers/:id', requireUser, async (req, res) => {
    const id = /^[a-f0-9]{24}$/.test(String(req.params['id'])) ? new ObjectId(String(req.params['id'])) : null;
    // Retired, not deleted: current members keep their tier until it expires.
    const t = id ? await tiers.findOneAndUpdate({ _id: id, channel: meId(req), active: true }, { $set: { active: false } }) : null;
    if (!t) throw notFound('Tier');
    res.status(204).end();
  });

  r.get('/me/members', requireUser, async (req, res) => {
    const list = await members.find({ channel: meId(req), expiresAt: { $gt: now() } }).sort({ startedAt: -1 }).limit(500).toArray();
    const people = await users.find({ _id: { $in: list.map((m) => m.member) } }, { projection: { displayName: 1, handle: 1, avatar: 1 } }).toArray();
    const byId = new Map(people.map((u) => [u._id.toHexString(), u]));
    res.json({
      items: list.map((m) => {
        const u = byId.get(m.member.toHexString());
        return { member: u ? { id: u._id.toHexString(), name: u.displayName, handle: u.handle, avatar: u.avatar } : null, ...membershipView(m) };
      }),
    });
  });

  // Joining -----------------------------------------------------------------------------------

  r.put('/channels/:ref/membership', requireUser, async (req, res) => {
    const { tierId } = joinBody.parse(req.body);
    const c = await channel(req.params['ref']);
    if (c._id.equals(meId(req))) throw badRequest('SELF_MEMBERSHIP', 'You cannot join your own channel');
    const tier = await tiers.findOne({ _id: new ObjectId(tierId), channel: c._id, active: true });
    if (!tier) throw notFound('Tier');
    const at = now();
    const current = await activeMembership(meId(req), c._id);
    // Sandbox payment: switching tier keeps the paid period; a new membership starts one.
    const expiresAt = current?.expiresAt ?? new Date(at.getTime() + MEMBERSHIP_DAYS * 86_400_000);
    const m = await members.findOneAndUpdate(
      { member: meId(req), channel: c._id },
      { $set: { tier: tier._id, level: tier.level, expiresAt, cancelled: false }, $setOnInsert: { startedAt: at } },
      { upsert: true, returnDocument: 'after' },
    );
    res.json({ membership: membershipView(m) });
  });

  r.delete('/channels/:ref/membership', requireUser, async (req, res) => {
    const c = await channel(req.params['ref']);
    const m = await members.findOneAndUpdate({ member: meId(req), channel: c._id, expiresAt: { $gt: now() } }, { $set: { cancelled: true } }, { returnDocument: 'after' });
    if (!m) throw notFound('Membership');
    res.json({ membership: membershipView(m) });
  });

  // Profile -----------------------------------------------------------------------------------

  r.patch('/me/profile', requireUser, async (req, res) => {
    const body = profileBody.parse(req.body);
    const me = await users.findOne({ _id: meId(req) });
    if (!me) throw notFound('Account');
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.displayName !== undefined) set['displayName'] = body.displayName;
    if (body.description !== undefined) set['description'] = body.description;
    if (body.notifyByEmail !== undefined) set['notifyByEmail'] = body.notifyByEmail;
    const update: Record<string, unknown> = { $set: set };
    if (body.handle !== undefined && body.handle !== me.handle) {
      if (RESERVED_HANDLES.has(body.handle)) throw conflict('HANDLE_TAKEN', 'This handle is not available');
      const since = now().getTime() - HANDLE_CHANGES.windowDays * 86_400_000;
      const recent = (me.handleChanges ?? []).filter((c) => c.at.getTime() > since);
      if (recent.length >= HANDLE_CHANGES.max) throw forbidden('HANDLE_CHANGE_LIMIT', `The handle can change ${HANDLE_CHANGES.max} times in ${HANDLE_CHANGES.windowDays} days`);
      set['handle'] = body.handle;
      update['$push'] = { handleChanges: { $each: [{ from: me.handle, to: body.handle, at: now() }], $slice: -10 } };
    }
    let after: UserDoc | null;
    try {
      after = await users.findOneAndUpdate({ _id: me._id }, update, { returnDocument: 'after' });
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) throw conflict('HANDLE_TAKEN', 'This handle is not available');
      throw err;
    }
    if (!after) throw notFound('Account');
    if (body.displayName !== undefined) await videos.updateMany({ owner: me._id }, { $set: { channelName: body.displayName } });
    res.json({ user: selfView(after) });
  });
};
