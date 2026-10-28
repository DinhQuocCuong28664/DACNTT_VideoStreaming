/**
 * Viewer reports, creator appeals and the staff console: review queue, decisions with reason
 * codes, comment reports, random audit samples, FP/FN metrics with Wilson intervals, the
 * decision log, and user roles. The machine verdict is kept before a human overrides it, so the
 * error rates of the automatic screening stay measurable.
 */
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import type { Feature } from '../app.js';
import { decideAccess, hasMembership } from '../access.js';
import { can, ROLES, type Role } from '../auth/tokens.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { rateLimit, requirePermission, requireUser } from '../http/middleware.js';
import { DECISION_REASONS, DECISIONS, MAX_NOTE, MAX_REPORT_DETAILS, REPORT_REASONS, classifyOutcome, type Decision } from '../model/moderation.js';
import type { UserDoc } from '../model/user.js';
import type { VideoDoc } from '../model/video.js';
import { decodeCursor, encodeCursor, videoViews } from './videos.js';

type MachineStatus = 'approved' | 'review' | 'removed';
interface Moderation {
  status: string;
  source?: string;
  machineStatus?: MachineStatus | null;
  reviewedByRole?: Role;
  labels?: { name?: string }[];
  openReports?: number;
}

/** Wilson score interval: honest for small samples and rates near 0 or 1 (Brown, Cai and DasGupta, 2001). */
export function wilson(successes: number, n: number, z = 1.96) {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const d = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / d;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  const r = (x: number) => Math.round(x * 10000) / 10000;
  return { value: r(p), low: r(Math.max(0, centre - margin)), high: r(Math.min(1, centre + margin)), n };
}

const id24 = z.string().regex(/^[a-f0-9]{24}$/);
const reportBody = z.object({ reason: z.enum(REPORT_REASONS), details: z.string().trim().max(MAX_REPORT_DETAILS).default('') });
const decisionBody = z.object({ decision: z.enum(DECISIONS), reasonCode: z.string(), note: z.string().trim().max(MAX_NOTE).default('') })
  .refine((b) => (DECISION_REASONS[b.decision] as readonly string[]).includes(b.reasonCode), { message: 'Pick a reason code of this decision', path: ['reasonCode'] });
const appealBody = z.object({ message: z.string().trim().min(10).max(500) });
const appealDecisionBody = z.object({ decision: z.enum(['uphold', 'reject']), resolution: z.string().trim().max(500).default('') });
const commentDecisionBody = z.object({ decision: z.enum(['dismiss', 'remove']) });
const auditBody = z.object({ result: z.enum(['pass', 'fail']), note: z.string().trim().max(MAX_NOTE).default('') });
const sampleBody = z.object({ size: z.number().int().min(1).max(200).default(30) });
const roleBody = z.object({ role: z.enum(ROLES) });
const pageQuery = z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });

const asId = (raw: unknown, what: string) => {
  const parsed = id24.safeParse(String(raw ?? ''));
  if (!parsed.success) throw notFound(what);
  return new ObjectId(parsed.data);
};

export const moderationFeature: Feature = (r, deps) => {
  const { db, now, kv, config } = deps;
  const videos = db.collection<VideoDoc>('videos');
  const users = db.collection<UserDoc>('users');
  const reports = db.collection('reports');
  const appeals = db.collection('appeals');
  const events = db.collection('moderationEvents');
  const samples = db.collection('auditSamples');
  const roleChanges = db.collection('roleChanges');
  const comments = db.collection('comments');
  const commentReports = db.collection('commentReports');
  const cards = videoViews(deps).cards;
  const me = (req: Request) => new ObjectId(req.user?.id);

  const syncOpenReports = async (video: ObjectId) => {
    const n = await reports.countDocuments({ video, status: 'open' });
    await videos.updateOne({ _id: video }, { $set: { 'moderation.openReports': n } });
    return n;
  };

  /** Applies a human decision; shared by the queue, appeals and audits. */
  async function decide(videoId: ObjectId, actor: { id: string; role: Role }, decision: Decision, reasonCode: string, note: string) {
    const v = await videos.findOne({ _id: videoId });
    if (!v) throw notFound('Video');
    const current = v.moderation as unknown as Moderation;
    if (current.source === 'human' && current.reviewedByRole === 'admin' && actor.role !== 'admin') {
      throw forbidden('ADMIN_DECISION', 'Only an admin can change a decision made by an admin');
    }
    // The machine verdict: kept once captured; otherwise the current status if the machine set it.
    const machine: MachineStatus | null = current.machineStatus
      ?? (current.source === 'auto' && ['approved', 'review', 'removed'].includes(current.status) ? (current.status as MachineStatus) : null);
    const at = now();
    await reports.updateMany({ video: videoId, status: 'open' }, { $set: { status: decision === 'approve' ? 'dismissed' : 'actioned', resolvedBy: new ObjectId(actor.id), resolvedAt: at } });
    const toStatus = decision === 'approve' ? 'approved' : 'removed';
    await videos.updateOne({ _id: videoId }, {
      $set: {
        'moderation.status': toStatus, 'moderation.source': 'human', 'moderation.machineStatus': machine,
        'moderation.reviewedBy': new ObjectId(actor.id), 'moderation.reviewedByRole': actor.role, 'moderation.reviewedAt': at,
        'moderation.note': note, 'moderation.reasonCode': reasonCode, updatedAt: at,
      },
    });
    await syncOpenReports(videoId);
    const action = decision === 'block' ? (current.status === 'removed' ? 'confirm' : 'block') : current.status === 'removed' ? 'restore' : 'approve';
    try {
      await events.insertOne({
        video: videoId, actor: new ObjectId(actor.id), actorRole: actor.role, decision, action,
        fromStatus: current.status, toStatus, machineStatus: machine, outcome: classifyOutcome(machine, decision),
        reasonCode, note, labels: (current.labels ?? []).slice(0, 5).map((l) => l.name ?? ''), createdAt: at,
      });
    } catch (err) {
      // The decision stands; a missing log line is reported, not rolled back.
      deps.log({ level: 'error', msg: 'moderation event not recorded', videoId: videoId.toHexString(), error: String(err) });
    }
    return toStatus;
  }

  // Viewer reports and creator appeals --------------------------------------------------------

  r.post('/videos/:id/report', requireUser, rateLimit(kv, config.tables.rateLimits, { scope: 'report', limit: 20, windowSec: 3600 }, now), async (req, res) => {
    const body = reportBody.parse(req.body);
    const v = await videos.findOne({ _id: asId(req.params['id'], 'Video') });
    if (!v) throw notFound('Video');
    if (v.owner.equals(me(req))) throw badRequest('OWN_VIDEO', 'You cannot report your own video');
    // Only videos the reporter can actually see.
    await decideAccess({ video: v, viewer: req.user, unlocked: true, isMember: () => hasMembership(db, req.user?.id, v.owner, now(), v.minTierLevel ?? 1) });
    try {
      await reports.insertOne({ video: v._id, reporter: me(req), reason: body.reason, details: body.details, status: 'open', createdAt: now() });
    } catch (err) {
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
      return void res.json({ reported: true, repeated: true });
    }
    await syncOpenReports(v._id);
    res.status(201).json({ reported: true, repeated: false });
  });

  r.post('/videos/:id/appeal', requireUser, async (req, res) => {
    const { message } = appealBody.parse(req.body);
    const v = await videos.findOne({ _id: asId(req.params['id'], 'Video') });
    if (!v || !v.owner.equals(me(req))) throw notFound('Video');
    if (v.moderation.status !== 'removed' && v.moderation.status !== 'review') throw conflict('NOT_RESTRICTED', 'Only removed or held videos can be appealed');
    try {
      await appeals.insertOne({ video: v._id, owner: v.owner, message, status: 'open', createdAt: now() });
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) throw conflict('APPEAL_OPEN', 'An appeal for this video is already open');
      throw err;
    }
    res.status(201).json({ appeal: { status: 'open' } });
  });

  r.get('/videos/:id/appeal', requireUser, async (req, res) => {
    const a = await appeals.find({ video: asId(req.params['id'], 'Video'), owner: me(req) }).sort({ createdAt: -1 }).limit(1).next();
    res.json({ appeal: a ? { status: a['status'], message: a['message'], resolution: a['resolution'] ?? null, createdAt: a['createdAt'] } : null });
  });

  // Staff console -----------------------------------------------------------------------------

  const staffReview = requirePermission('moderation:review');

  r.get('/admin/stats', requireUser, async (req, res) => {
    if (!can(req.user?.role, 'moderation:review') && !can(req.user?.role, 'metrics:read')) throw forbidden();
    const [review, removed, reportedComments, openAppeals] = await Promise.all([
      videos.countDocuments({ 'moderation.status': { $ne: 'removed' }, $or: [{ 'moderation.status': 'review' }, { 'moderation.openReports': { $gt: 0 } }] }),
      videos.countDocuments({ 'moderation.status': 'removed' }),
      comments.countDocuments({ openReports: { $gt: 0 } }),
      appeals.countDocuments({ status: 'open' }),
    ]);
    res.json({ review, removed, reportedComments, openAppeals });
  });

  r.get('/admin/queue', staffReview, async (req, res) => {
    const q = pageQuery.extend({ tab: z.enum(['review', 'removed']).default('review') }).parse(req.query);
    const cursor = decodeCursor(q.cursor);
    const filter: Record<string, unknown> = q.tab === 'review'
      ? { 'moderation.status': { $ne: 'removed' }, $or: [{ 'moderation.status': 'review' }, { 'moderation.openReports': { $gt: 0 } }] }
      : { 'moderation.status': 'removed' };
    if (cursor) filter['$and'] = [{ $or: [{ createdAt: { $lt: cursor.at } }, { createdAt: cursor.at, _id: { $lt: cursor.id } }] }];
    const list = await videos.find(filter).sort({ createdAt: -1, _id: -1 }).limit(q.limit + 1).toArray();
    const page = list.slice(0, q.limit);
    const showEmail = can(req.user?.role, 'pii:email');
    const owners = showEmail ? new Map((await users.find({ _id: { $in: page.map((v) => v.owner) } }, { projection: { email: 1 } }).toArray()).map((u) => [u._id.toHexString(), u.email])) : new Map<string, string>();
    const base = await cards(page);
    const last = page.at(-1);
    res.json({
      items: page.map((v, i) => ({ ...base.at(i), status: v.status, moderation: v.moderation, ownerEmail: showEmail ? owners.get(v.owner.toHexString()) ?? null : undefined })),
      nextCursor: list.length > q.limit && last ? encodeCursor(last.createdAt, last._id) : null,
    });
  });

  r.get('/admin/videos/:id/reports', staffReview, async (req, res) => {
    const video = asId(req.params['id'], 'Video');
    const list = await reports.find({ video }).sort({ createdAt: -1 }).limit(200).toArray();
    const byReason = new Map<string, number>();
    for (const rep of list) if (rep['status'] === 'open') byReason.set(String(rep['reason']), (byReason.get(String(rep['reason'])) ?? 0) + 1);
    res.json({
      items: list.map((rep) => ({ reason: rep['reason'], details: rep['details'], status: rep['status'], createdAt: rep['createdAt'] })),
      openByReason: Object.fromEntries(byReason),
    });
  });

  r.post('/admin/videos/:id/decision', staffReview, async (req, res) => {
    const body = decisionBody.parse(req.body);
    const status = await decide(asId(req.params['id'], 'Video'), { id: req.user?.id ?? '', role: req.user?.role ?? 'user' }, body.decision, body.reasonCode, body.note);
    res.json({ moderation: { status } });
  });

  r.get('/admin/comments', staffReview, async (req, res) => {
    const q = pageQuery.parse(req.query);
    const list = await comments.find({ openReports: { $gt: 0 } }).sort({ openReports: -1, _id: -1 }).limit(q.limit).toArray();
    res.json({ items: list.map((c) => ({ id: String(c['_id']), video: String(c['video']), body: c['body'], openReports: c['openReports'] })) });
  });

  r.post('/admin/comments/:id/decision', staffReview, async (req, res) => {
    const { decision } = commentDecisionBody.parse(req.body);
    const c = await comments.findOne({ _id: asId(req.params['id'], 'Comment') });
    if (!c) throw notFound('Comment');
    const at = now();
    if (decision === 'remove') {
      await comments.deleteMany({ $or: [{ _id: c._id }, { parent: c._id }] });
      await commentReports.updateMany({ comment: c._id, status: 'open' }, { $set: { status: 'actioned', resolvedBy: me(req), resolvedAt: at, commentText: c['body'], commentAuthor: c['author'] } });
      const n = await comments.countDocuments({ video: c['video'] });
      await videos.updateOne({ _id: c['video'] as ObjectId }, { $set: { 'counters.comments': n } });
      if (c['parent']) await comments.updateOne({ _id: c['parent'] as ObjectId }, { $set: { replyCount: await comments.countDocuments({ parent: c['parent'] }) } });
    } else {
      await commentReports.updateMany({ comment: c._id, status: 'open' }, { $set: { status: 'dismissed', resolvedBy: me(req), resolvedAt: at } });
      await comments.updateOne({ _id: c._id }, { $set: { openReports: await commentReports.countDocuments({ comment: c._id, status: 'open' }) } });
    }
    res.json({ decision });
  });

  r.get('/admin/appeals', requirePermission('moderation:appeals'), async (req, res) => {
    const status = z.enum(['open', 'upheld', 'rejected']).default('open').parse(req.query['status']);
    const list = await appeals.find({ status }).sort({ createdAt: 1 }).limit(100).toArray();
    const vids = await videos.find({ _id: { $in: list.map((a) => a['video'] as ObjectId) } }).toArray();
    const base = new Map((await cards(vids)).map((c) => [c.id, c]));
    res.json({ items: list.map((a) => ({ id: String(a['_id']), message: a['message'], status: a['status'], createdAt: a['createdAt'], video: base.get(String(a['video'])) ?? null })) });
  });

  r.post('/admin/appeals/:id/decision', requirePermission('moderation:appeals'), async (req, res) => {
    const body = appealDecisionBody.parse(req.body);
    const a = await appeals.findOneAndUpdate(
      { _id: asId(req.params['id'], 'Appeal'), status: 'open' },
      { $set: { status: body.decision === 'uphold' ? 'upheld' : 'rejected', resolution: body.resolution, resolvedBy: me(req), resolvedAt: now() } },
      { returnDocument: 'after' },
    );
    if (!a) throw notFound('Appeal');
    const actor = { id: req.user?.id ?? '', role: req.user?.role ?? 'user' };
    if (body.decision === 'uphold') await decide(a['video'] as ObjectId, actor, 'approve', 'appeal_upheld', body.resolution);
    res.json({ appeal: { status: a['status'] } });
  });

  r.post('/admin/audit/sample', requirePermission('moderation:sample'), async (req, res) => {
    const { size } = sampleBody.parse(req.body ?? {});
    // Machine-approved videos no human has looked at: the only way to estimate what the model missed.
    const picked = await videos.aggregate<{ _id: ObjectId }>([
      { $match: { status: 'READY', 'moderation.status': 'approved', 'moderation.source': 'auto' } },
      { $sample: { size } },
      { $project: { _id: 1 } },
    ]).toArray();
    const at = now();
    const docs = picked.map((p) => ({ video: p._id, status: 'pending', createdAt: at, createdBy: me(req) }));
    if (docs.length) await samples.insertMany(docs, { ordered: false }).catch((err: unknown) => {
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
    });
    res.status(201).json({ sampled: docs.length });
  });

  r.get('/admin/audit', requirePermission('moderation:audit'), async (_req, res) => {
    const list = await samples.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(100).toArray();
    const vids = await videos.find({ _id: { $in: list.map((s) => s['video'] as ObjectId) } }).toArray();
    const base = new Map((await cards(vids)).map((c) => [c.id, c]));
    res.json({ items: list.map((s) => ({ id: String(s['_id']), video: base.get(String(s['video'])) ?? null })) });
  });

  r.post('/admin/audit/:id', requirePermission('moderation:audit'), async (req, res) => {
    const body = auditBody.parse(req.body);
    const s = await samples.findOneAndUpdate(
      { _id: asId(req.params['id'], 'Sample'), status: 'pending' },
      { $set: { status: body.result, note: body.note, labelledBy: me(req), labelledAt: now() } },
      { returnDocument: 'after' },
    );
    if (!s) throw notFound('Sample');
    if (body.result === 'fail') await decide(s['video'] as ObjectId, { id: req.user?.id ?? '', role: req.user?.role ?? 'user' }, 'block', 'audit_failed', body.note);
    res.json({ sample: { status: s['status'] } });
  });

  r.get('/admin/metrics', requirePermission('metrics:read'), async (_req, res) => {
    const rows = await videos.aggregate<{ _id: { machine: string | null; final: string; human: boolean }; count: number }>([
      { $match: { 'moderation.status': { $in: ['approved', 'review', 'removed'] } } },
      { $project: {
        machine: { $ifNull: ['$moderation.machineStatus', { $cond: [{ $eq: ['$moderation.source', 'auto'] }, '$moderation.status', null] }] },
        final: '$moderation.status',
        human: { $eq: ['$moderation.source', 'human'] },
      } },
      { $group: { _id: { machine: '$machine', final: '$final', human: '$human' }, count: { $sum: 1 } } },
    ]).toArray();
    const sum = (f: (k: { machine: string | null; final: string; human: boolean }) => boolean) => rows.filter((x) => f(x._id)).reduce((s, x) => s + x.count, 0);
    const removedReviewed = sum((k) => k.machine === 'removed' && k.human);
    const falsePositive = sum((k) => k.machine === 'removed' && k.human && k.final === 'approved');
    const removedUnreviewed = sum((k) => k.machine === 'removed' && !k.human);
    const heldReviewed = sum((k) => k.machine === 'review' && k.human);
    const heldConfirmed = sum((k) => k.machine === 'review' && k.human && k.final === 'removed');
    const [pass, fail, pending] = await Promise.all(['pass', 'fail', 'pending'].map((status) => samples.countDocuments({ status })));
    const byReason = await events.aggregate([{ $group: { _id: { outcome: '$outcome', reasonCode: '$reasonCode' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray();
    res.json({
      autoRemoved: { reviewed: removedReviewed, falsePositive, unreviewed: removedUnreviewed, falsePositiveRate: wilson(falsePositive, removedReviewed) },
      autoHeld: { reviewed: heldReviewed, confirmed: heldConfirmed, unreviewed: sum((k) => k.machine === 'review' && !k.human), precision: wilson(heldConfirmed, heldReviewed) },
      missed: { falseNegative: sum((k) => k.machine === 'approved' && k.human && k.final === 'removed') },
      audit: { pending, labelled: (pass ?? 0) + (fail ?? 0), failed: fail, falseNegativeRate: wilson(fail ?? 0, (pass ?? 0) + (fail ?? 0)) },
      byReason: byReason.map((x) => ({ ...(x['_id'] as object), count: x['count'] })),
    });
  });

  r.get('/admin/events', requirePermission('events:read'), async (req, res) => {
    const q = pageQuery.extend({ outcome: z.enum(['false_positive', 'flag_noise', 'false_negative', 'true_positive', 'true_negative', 'unclassified']).optional() }).parse(req.query);
    const cursor = decodeCursor(q.cursor);
    const filter: Record<string, unknown> = {};
    if (q.outcome) filter['outcome'] = q.outcome;
    if (cursor) filter['_id'] = { $lt: cursor.id };
    const list = await events.find(filter).sort({ _id: -1 }).limit(q.limit + 1).toArray();
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    res.json({
      items: page.map((e) => ({ video: String(e['video']), actorRole: e['actorRole'], decision: e['decision'], action: e['action'], outcome: e['outcome'], reasonCode: e['reasonCode'], note: e['note'], createdAt: e['createdAt'] })),
      nextCursor: list.length > q.limit && last ? encodeCursor(last['createdAt'] as Date, last._id) : null,
    });
  });

  r.get('/admin/users', requirePermission('users:manage'), async (req, res) => {
    const q = pageQuery.extend({ q: z.string().trim().toLowerCase().max(100).optional(), role: z.enum(ROLES).optional() }).parse(req.query);
    const filter: Record<string, unknown> = {};
    if (q.role) filter['role'] = q.role;
    // A prefix match on the indexed e-mail and handle; the text is escaped, never a pattern.
    if (q.q) {
      const prefix = q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['$or'] = [{ email: { $regex: `^${prefix}` } }, { handle: { $regex: `^${prefix}` } }];
    }
    const list = await users.find(filter).sort({ _id: -1 }).limit(q.limit).toArray();
    res.json({ items: list.map((u) => ({ id: u._id.toHexString(), email: u.email, handle: u.handle, displayName: u.displayName, role: u.role, disabled: u.disabled, createdAt: u.createdAt })) });
  });

  r.put('/admin/users/:id/role', requirePermission('users:manage'), async (req, res) => {
    const { role } = roleBody.parse(req.body);
    const target = await users.findOne({ _id: asId(req.params['id'], 'User') });
    if (!target) throw notFound('User');
    if (target.role === 'admin' && role !== 'admin' && (await users.countDocuments({ role: 'admin' })) <= 1) {
      throw conflict('LAST_ADMIN', 'At least one admin must remain');
    }
    if (target.role !== role) {
      await users.updateOne({ _id: target._id }, { $set: { role, updatedAt: now() } });
      await roleChanges.insertOne({ user: target._id, from: target.role, to: role, by: me(req), at: now() });
      deps.sessions.forget(target._id.toHexString());
    }
    res.json({ user: { id: target._id.toHexString(), role } });
  });

  r.get('/admin/role-changes', requirePermission('events:read'), async (_req, res) => {
    const list = await roleChanges.find({}).sort({ at: -1 }).limit(200).toArray();
    res.json({ items: list.map((c) => ({ user: String(c['user']), from: c['from'], to: c['to'], by: String(c['by']), at: c['at'] })) });
  });
};
