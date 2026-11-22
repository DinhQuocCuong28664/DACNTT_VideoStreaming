import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { median } from '../src/features/system.js';
import { memoryDb, testConfig } from './helpers.js';
import { world, type Who, type World } from './world.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let w: World;
let admin: Who;
let auditor: Who;
let op: Who;
let creator: Who;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  w = world(await mongo.fresh());
  admin = await w.user('admin@example.com', 'admin');
  auditor = await w.user('audit@example.com', 'auditor');
  op = await w.user('op@example.com', 'operator');
  creator = await w.user('creator@example.com');
});

const billing = (plan: string, status: string, periodEnd: Date | null, cancelAtPeriodEnd = false) => ({
  plan, status, currentPeriodEnd: periodEnd, cancelAtPeriodEnd, customerId: 'cus_1', subscriptionId: 'sub_1', eventAt: 1,
});

describe('median', () => {
  it('is null for no values and averages the middle pair of an even list', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('admin overview', () => {
  it('is for administrators only', async () => {
    expect((await w.call('get', '/admin/overview', undefined, { token: auditor.token })).status).toBe(403);
    expect((await w.call('get', '/admin/overview', undefined, { token: op.token })).status).toBe(403);
    expect((await w.call('get', '/admin/overview', undefined, { token: creator.token })).status).toBe(403);
    expect((await w.call('get', '/admin/overview')).status).toBe(401);
    expect((await w.call('get', '/admin/overview?days=12', undefined, { token: admin.token })).status).toBe(400);
  });

  it('counts plans as activePlan does and sums the monthly price of paying users', async () => {
    const at = w.ctx.clock.now;
    const later = new Date(at.getTime() + 10 * 86_400_000);
    const earlier = new Date(at.getTime() - 86_400_000);
    const plus = await w.user('plus@example.com');
    const pro = await w.user('pro@example.com');
    const ended = await w.user('ended@example.com');
    const users = w.db.collection('users');
    await users.updateOne({ _id: new ObjectId(plus.id) }, { $set: { billing: billing('plus', 'active', later, true) } });
    await users.updateOne({ _id: new ObjectId(pro.id) }, { $set: { billing: billing('pro', 'past_due', later) } });
    await users.updateOne({ _id: new ObjectId(ended.id) }, { $set: { billing: billing('max', 'canceled', earlier) } });

    const res = await w.call('get', '/admin/overview', undefined, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.users).toMatchObject({ total: 7, verified: 7, new: 7, staff: { admin: 1, auditor: 1, operator: 1 } });
    expect(res.body.plans).toMatchObject({ free: 5, plus: 1, pro: 1, max: 0, paying: 2, cancelling: 1, pastDue: 1, monthlyRevenueVnd: 148_000 });
  });

  it('reports content, errors, processing time, captions and views over the window', async () => {
    const at = w.ctx.clock.now;
    const done = new Date(at.getTime() - 60_000);
    const upload = { mode: 'post' as const, size: 10, contentType: 'video/mp4', fileName: 'a.mp4', partSize: null, uploadId: null, startedAt: done, completedAt: done };
    await w.video(creator.id, { durationSec: 90, upload, processedAt: new Date(done.getTime() + 100_000) });
    await w.video(creator.id, { durationSec: 30, upload, processedAt: new Date(done.getTime() + 200_000), moderation: { status: 'approved', source: 'disabled' } });
    await w.video(creator.id, { moderation: { status: 'review' } });
    await w.video(creator.id, { status: 'ERROR', error: 'VideoTooLong: 61 min is over the plan', processedAt: null, hlsPath: null });
    await w.video(creator.id, { status: 'ERROR', error: 'VideoTooLong: 61 min is over the plan', processedAt: null, hlsPath: null });
    // Outside a 7-day window, inside the default 30 days.
    await w.video(creator.id, { status: 'ERROR', error: 'probe failed', processedAt: null, createdAt: new Date(at.getTime() - 10 * 86_400_000) });
    const today = at.toISOString().slice(0, 10);
    await w.db.collection('analyticsDaily').insertMany([
      { video: new ObjectId(), date: today, views: 4, watchSeconds: 1800 },
      { video: new ObjectId(), date: today, views: 2, watchSeconds: 1800 },
      { video: new ObjectId(), date: '2000-01-01', views: 99, watchSeconds: 99 },
    ]);
    const month = at.toISOString().slice(0, 7);
    await w.db.collection('captionUsage').insertMany([
      { _id: `${creator.id}:${month}` as never, owner: creator.id, month, seconds: 300 },
      { _id: `${admin.id}:${month}` as never, owner: admin.id, month, seconds: 0 },
      { _id: `${admin.id}:2000-01` as never, owner: admin.id, month: '2000-01', seconds: 900 },
    ]);

    const week = (await w.call('get', '/admin/overview?days=7', undefined, { token: admin.token })).body;
    expect(week.videos).toMatchObject({ total: 6, readySeconds: 120 + 120, uploads: 5, errors: 2 });
    // Statuses cover every video; uploads and errors only the window.
    expect(week.videos.byStatus).toMatchObject({ READY: 3, ERROR: 3, PROCESSING: 0 });
    expect(week.videos.topErrors).toEqual([{ reason: 'VideoTooLong: 61 min is over the plan', count: 2 }]);
    // Three processed videos took 100 s, 200 s and 0 s (the default video of the world).
    expect(week.videos).toMatchObject({ medianProcessingSec: 100, processedSample: 3 });
    expect(week.moderation).toMatchObject({ approved: 2, review: 1, unscreened: 1 });
    expect(week.captions).toEqual({ month, minutesUsed: 5, creators: 1 });
    expect(week.views).toEqual({ views: 6, watchHours: 1 });
    expect(week.daily).toHaveLength(7);
    expect(week.daily.at(-1)).toMatchObject({ date: today, uploads: 5, views: 6 });

    const month30 = (await w.call('get', '/admin/overview', undefined, { token: admin.token })).body;
    expect(month30.days).toBe(30);
    expect(month30.videos.errors).toBe(3);
  });
});

describe('runtime switches', () => {
  it('are for administrators only and validate their body', async () => {
    expect((await w.call('get', '/admin/settings', undefined, { token: auditor.token })).status).toBe(403);
    expect((await w.call('put', '/admin/settings', { moderationEnabled: false }, { token: op.token })).status).toBe(403);
    expect((await w.call('put', '/admin/settings', {}, { token: admin.token })).status).toBe(400);
    expect((await w.call('put', '/admin/settings', { moderationEnabled: 'no' }, { token: admin.token })).status).toBe(400);
    expect((await w.call('put', '/admin/settings', { other: true }, { token: admin.token })).status).toBe(400);
  });

  it('start from the defaults of the infrastructure and log every change once', async () => {
    const first = (await w.call('get', '/admin/settings', undefined, { token: admin.token })).body;
    expect(first.moderation).toEqual({ enabled: true, source: 'default', default: true });
    expect(first.autoCaptions).toEqual({ enabled: true, source: 'default', infraEnabled: true });
    expect(first.changes).toEqual([]);

    const off = await w.call('put', '/admin/settings', { moderationEnabled: false }, { token: admin.token });
    expect(off.status).toBe(200);
    expect(off.body.moderation).toEqual({ enabled: false, source: 'console', default: true });
    const handle = (await w.db.collection('users').findOne({ _id: new ObjectId(admin.id) }))?.['handle'];
    expect(off.body.updatedBy).toBe(handle);
    // Setting a value it already has stores it but logs nothing new.
    await w.call('put', '/admin/settings', { moderationEnabled: false, autoCaptionsEnabled: false }, { token: admin.token });
    const view = (await w.call('get', '/admin/settings', undefined, { token: admin.token })).body;
    expect(view.autoCaptions).toMatchObject({ enabled: false, source: 'console' });
    expect(view.changes.map((c: { key: string; from: boolean; to: boolean; by: string }) => [c.key, c.from, c.to, c.by])).toEqual([
      ['autoCaptionsEnabled', true, false, handle],
      ['moderationEnabled', true, false, handle],
    ]);
    const stored = await w.db.collection('settings').findOne({ _id: 'system' as never });
    expect(stored).toMatchObject({ moderationEnabled: false, autoCaptionsEnabled: false });
  });

  it('cannot switch captions on while the infrastructure has removed their trigger', async () => {
    const locked = world(await mongo.fresh(), testConfig({ AUTO_CAPTIONS_INFRA: 'false', MODERATION_DEFAULT: 'false' }));
    const boss = await locked.user('boss@example.com', 'admin');
    const view = (await locked.call('get', '/admin/settings', undefined, { token: boss.token })).body;
    expect(view.moderation).toEqual({ enabled: false, source: 'default', default: false });
    expect(view.autoCaptions).toEqual({ enabled: false, source: 'default', infraEnabled: false });
    const refused = await locked.call('put', '/admin/settings', { autoCaptionsEnabled: true }, { token: boss.token });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('CAPTIONS_OFF_IN_INFRA');
    expect((await locked.call('put', '/admin/settings', { moderationEnabled: true }, { token: boss.token })).body.moderation.enabled).toBe(true);
  });
});
