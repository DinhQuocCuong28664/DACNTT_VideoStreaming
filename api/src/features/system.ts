/**
 * The system side of the staff console, for administrators: one overview of users, plans,
 * content, processing, automatic captions and views over a window of days. Every number is
 * computed from the documents on request; the collections are small enough for that on the
 * free database tier, and nothing here is written.
 */
import { z } from 'zod';
import { VIDEO_STATUSES } from '@zelos/shared';
import type { Feature } from '../app.js';
import { requirePermission } from '../http/middleware.js';
import { activePlan, LEGACY_BEFORE, PLAN_IDS, planDef, type BillingState, type PlanId } from '../billing/plans.js';
import type { UserDoc } from '../model/user.js';
import type { VideoDoc } from '../model/video.js';

const DAY_MS = 86_400_000;
const WINDOWS = ['7', '30', '90'] as const;
const windowQuery = z.object({ days: z.enum(WINDOWS).default('30') });
/** Longest error reason kept in the overview; reasons can quote long tool output. */
const REASON_CHARS = 120;
/** Upper bound of processed videos read to compute the median processing time. */
const TIMING_SAMPLE = 2000;

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Middle value of a list of numbers, or null when the list is empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted.at(mid) ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted.at(mid - 1) ?? 0) + upper) / 2;
}

/** Counts per key of an aggregation that grouped on `_id`. */
const countsOf = (rows: { _id: unknown; n: number }[]): Map<string, number> => new Map(rows.map((r) => [String(r._id), r.n]));

export const systemFeature: Feature = (r, deps) => {
  const { db, now } = deps;
  const users = db.collection<UserDoc>('users');
  const videos = db.collection<VideoDoc>('videos');
  const daily = db.collection('analyticsDaily');
  const captionUsage = db.collection('captionUsage');

  r.get('/admin/overview', requirePermission('system:read'), async (req, res) => {
    const days = Number(windowQuery.parse(req.query).days);
    const at = now();
    const firstDay = new Date(Date.parse(dayOf(at)) - (days - 1) * DAY_MS);
    const since = dayOf(firstDay);
    const month = at.toISOString().slice(0, 7);
    const perDay = (field: string) => [
      { $match: { [field]: { $gte: firstDay } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}` } }, n: { $sum: 1 } } },
    ];

    const [
      totalUsers, verifiedUsers, newUsers, legacyUsers, staffRows, billed,
      statusRows, moderationRows, unscreened, readyRows, uploadRows, signupRows, errorRows, timingRows, viewRows, captionRows,
    ] = await Promise.all([
      users.countDocuments({}),
      users.countDocuments({ emailVerified: true }),
      users.countDocuments({ createdAt: { $gte: firstDay } }),
      users.countDocuments({ createdAt: { $lt: LEGACY_BEFORE } }),
      users.aggregate<{ _id: string; n: number }>([{ $match: { role: { $ne: 'user' } } }, { $group: { _id: '$role', n: { $sum: 1 } } }]).toArray(),
      users.find({ billing: { $ne: null } }, { projection: { billing: 1, createdAt: 1 } }).toArray(),
      videos.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
      videos.aggregate<{ _id: string; n: number }>([{ $match: { status: { $in: ['READY', 'SCHEDULED'] } } }, { $group: { _id: '$moderation.status', n: { $sum: 1 } } }]).toArray(),
      videos.countDocuments({ status: { $in: ['READY', 'SCHEDULED'] }, 'moderation.source': 'disabled' }),
      videos.aggregate<{ seconds: number }>([{ $match: { status: 'READY' } }, { $group: { _id: null, seconds: { $sum: { $ifNull: ['$durationSec', 0] } } } }]).toArray(),
      videos.aggregate<{ _id: string; n: number }>(perDay('createdAt')).toArray(),
      users.aggregate<{ _id: string; n: number }>(perDay('createdAt')).toArray(),
      videos.aggregate<{ _id: string; n: number }>([
        { $match: { status: 'ERROR', createdAt: { $gte: firstDay } } },
        { $group: { _id: { $substrCP: [{ $ifNull: ['$error', 'unknown'] }, 0, REASON_CHARS] }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]).toArray(),
      videos.aggregate<{ ms: number }>([
        { $match: { processedAt: { $gte: firstDay }, 'upload.completedAt': { $type: 'date' } } },
        { $sort: { processedAt: -1 } },
        { $limit: TIMING_SAMPLE },
        { $project: { _id: 0, ms: { $subtract: ['$processedAt', '$upload.completedAt'] } } },
      ]).toArray(),
      daily.aggregate<{ _id: string; views: number; watchSeconds: number }>([
        { $match: { date: { $gte: since } } },
        { $group: { _id: '$date', views: { $sum: { $ifNull: ['$views', 0] } }, watchSeconds: { $sum: { $ifNull: ['$watchSeconds', 0] } } } },
      ]).toArray(),
      captionUsage.aggregate<{ seconds: number; creators: number }>([
        { $match: { month } },
        { $group: { _id: null, seconds: { $sum: '$seconds' }, creators: { $sum: { $cond: [{ $gt: ['$seconds', 0] }, 1, 0] } } } },
      ]).toArray(),
    ]);

    // Plans: a paid plan counts while activePlan says so; everything else is free.
    const plans = new Map<PlanId, number>(PLAN_IDS.map((p) => [p, 0]));
    let revenueVnd = 0;
    let cancelling = 0;
    let pastDue = 0;
    let paidLegacy = 0;
    for (const u of billed) {
      const plan = activePlan(u as { createdAt: Date; billing: BillingState | null }, at);
      if (plan === 'free') continue;
      plans.set(plan, (plans.get(plan) ?? 0) + 1);
      revenueVnd += planDef(plan).priceVnd;
      if (u.billing?.cancelAtPeriodEnd) cancelling += 1;
      if (u.billing?.status === 'past_due') pastDue += 1;
      if (u.createdAt.getTime() < LEGACY_BEFORE.getTime()) paidLegacy += 1;
    }
    const paying = [...plans.values()].reduce((s, n) => s + n, 0);
    plans.set('free', totalUsers - paying);

    const statuses = countsOf(statusRows);
    const moderation = countsOf(moderationRows);
    const uploads = countsOf(uploadRows);
    const signups = countsOf(signupRows);
    const views = new Map(viewRows.map((v) => [v._id, v]));
    const series = Array.from({ length: days }, (_, i) => {
      const date = dayOf(new Date(firstDay.getTime() + i * DAY_MS));
      return { date, signups: signups.get(date) ?? 0, uploads: uploads.get(date) ?? 0, views: views.get(date)?.views ?? 0 };
    });
    const processing = median(timingRows.map((t) => t.ms).filter((ms) => ms >= 0));
    const caption = captionRows[0];

    res.json({
      days,
      generatedAt: at.toISOString(),
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        new: newUsers,
        staff: { operator: 0, auditor: 0, admin: 0, ...Object.fromEntries(countsOf(staffRows)) },
      },
      plans: { ...Object.fromEntries(plans), paying, cancelling, pastDue, legacy: legacyUsers - paidLegacy, monthlyRevenueVnd: revenueVnd },
      videos: {
        total: statusRows.reduce((s, x) => s + x.n, 0),
        byStatus: Object.fromEntries(VIDEO_STATUSES.map((s) => [s, statuses.get(s) ?? 0])),
        readySeconds: Math.round(readyRows[0]?.seconds ?? 0),
        uploads: series.reduce((s, d) => s + d.uploads, 0),
        errors: errorRows.reduce((s, x) => s + x.n, 0),
        topErrors: errorRows.slice(0, 5).map((x) => ({ reason: x._id, count: x.n })),
        medianProcessingSec: processing === null ? null : Math.round(processing / 100) / 10,
        processedSample: timingRows.length,
      },
      moderation: {
        approved: moderation.get('approved') ?? 0,
        review: moderation.get('review') ?? 0,
        removed: moderation.get('removed') ?? 0,
        pending: moderation.get('pending') ?? 0,
        unscreened,
      },
      captions: { month, minutesUsed: Math.round((caption?.seconds ?? 0) / 6) / 10, creators: caption?.creators ?? 0 },
      views: {
        views: viewRows.reduce((s, v) => s + v.views, 0),
        watchHours: Math.round(viewRows.reduce((s, v) => s + v.watchSeconds, 0) / 360) / 10,
      },
      daily: series,
    });
  });
};
