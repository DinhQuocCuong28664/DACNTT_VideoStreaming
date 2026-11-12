import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { activePlan, entitlements, LEGACY_BEFORE, PLANS } from '../src/billing/plans.js';
import type { BillingEvent } from '../src/services/billing.js';
import { GOOD_SIGNATURE, memoryDb } from './helpers.js';
import { world, type Who, type World } from './world.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let w: World;
let user: Who;

const GIB = 1024 ** 3;
const T0 = Math.floor(new Date('2026-11-20T10:00:00Z').getTime() / 1000);

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  w = world(await mongo.fresh());
  user = await w.user('payer@example.com');
  // A new account: created after the grandfathering date, so it gets the real free limits.
  await w.db.collection('users').updateOne({ _id: new ObjectId(user.id) }, { $set: { createdAt: new Date('2026-11-20T00:00:00Z') } });
});

const webhook = (event: BillingEvent, signature = GOOD_SIGNATURE) =>
  w.call('post', '/billing/webhook', event, { headers: { 'stripe-signature': signature } });

const subscription = (over: Partial<Extract<BillingEvent, { type: 'subscription' }>> = {}): BillingEvent => ({
  id: `evt_${Math.random().toString(36).slice(2)}`, created: T0, type: 'subscription',
  userId: user.id, customerId: 'cus_1', subscriptionId: 'sub_1', plan: 'pro', status: 'active',
  currentPeriodEnd: new Date((T0 + 30 * 86_400) * 1000), cancelAtPeriodEnd: false, ...over,
});

describe('entitlements', () => {
  const at = new Date('2026-11-20T10:00:00Z');
  const fresh = { createdAt: new Date('2026-11-20T00:00:00Z') };

  it('gives new free accounts the free limits and old ones the Pro limits', () => {
    expect(entitlements(fresh, at)).toMatchObject({ plan: 'free', maxUploadBytes: 2 * GIB, maxTiers: 2 });
    const old = { createdAt: new Date(LEGACY_BEFORE.getTime() - 1) };
    expect(entitlements(old, at)).toMatchObject({ plan: 'free', maxUploadBytes: PLANS.pro.maxUploadBytes, maxTiers: 5 });
  });

  it('counts a paid plan while active, or until the paid period ends', () => {
    const end = new Date('2026-12-01T00:00:00Z');
    const base = { plan: 'plus' as const, currentPeriodEnd: end, cancelAtPeriodEnd: false, customerId: 'c', subscriptionId: 's', eventAt: 1 };
    expect(activePlan({ ...fresh, billing: { ...base, status: 'active' } }, at)).toBe('plus');
    expect(activePlan({ ...fresh, billing: { ...base, status: 'past_due' } }, at)).toBe('plus');
    expect(activePlan({ ...fresh, billing: { ...base, status: 'canceled' } }, at)).toBe('plus');
    expect(activePlan({ ...fresh, billing: { ...base, status: 'canceled' } }, new Date('2026-12-02T00:00:00Z'))).toBe('free');
    expect(activePlan({ ...fresh, billing: { ...base, status: 'incomplete', currentPeriodEnd: null } }, at)).toBe('free');
  });
});

describe('plans and checkout', () => {
  it('lists the plans publicly with VND prices', async () => {
    const res = await w.call('get', '/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans.map((p: { id: string; priceVnd: number }) => [p.id, p.priceVnd])).toEqual([['free', 0], ['plus', 49000], ['pro', 99000], ['max', 199000]]);
  });

  it('needs a signed-in user with a verified e-mail and a paid plan id', async () => {
    expect((await w.call('post', '/billing/checkout', { plan: 'pro' })).status).toBe(401);
    expect((await w.call('post', '/billing/checkout', { plan: 'free' }, { token: user.token })).body.error.code).toBe('INVALID_PLAN');
    await w.db.collection('users').updateOne({ _id: new ObjectId(user.id) }, { $set: { emailVerified: false } });
    expect((await w.call('post', '/billing/checkout', { plan: 'pro' }, { token: user.token })).body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('creates a checkout for the chosen plan and refuses a second subscription', async () => {
    const res = await w.call('post', '/billing/checkout', { plan: 'pro' }, { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('/pro');
    expect(w.ctx.billing.checkouts[0]).toMatchObject({ userId: user.id, plan: 'pro', email: 'payer@example.com' });
    await webhook(subscription());
    const again = await w.call('post', '/billing/checkout', { plan: 'max' }, { token: user.token });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBSCRIBED');
  });

  it('opens the portal only for someone who has a Stripe customer', async () => {
    expect((await w.call('post', '/billing/portal', {}, { token: user.token })).body.error.code).toBe('NO_CUSTOMER');
    await webhook(subscription());
    const res = await w.call('post', '/billing/portal', {}, { token: user.token });
    expect(res.status).toBe(200);
    expect(w.ctx.billing.portals[0]?.customerId).toBe('cus_1');
  });
});

describe('webhook', () => {
  it('refuses a missing or wrong signature and changes nothing', async () => {
    expect((await webhook(subscription(), 'forged')).status).toBe(400);
    const res = await w.call('post', '/billing/webhook', subscription());
    expect(res.status).toBe(400);
    expect((await w.call('get', '/billing', undefined, { token: user.token })).body.plan).toBe('free');
  });

  it('activates the plan from a subscription event and shows it to the user', async () => {
    const res = await webhook(subscription({ plan: 'plus' }));
    expect(res.status).toBe(200);
    const billing = (await w.call('get', '/billing', undefined, { token: user.token })).body;
    expect(billing).toMatchObject({ plan: 'plus', hasCustomer: true, cancelAtPeriodEnd: false });
    expect(billing.limits.maxUploadBytes).toBe(5 * GIB);
    const me = (await w.call('get', '/auth/me', undefined, { token: user.token })).body.user;
    expect(me.plan.id).toBe('plus');
  });

  it('applies a repeated event once', async () => {
    const event = subscription({ plan: 'plus' });
    expect((await webhook(event)).body).toEqual({ received: true });
    expect((await webhook(event)).body).toEqual({ received: true, duplicate: true });
    expect(await w.db.collection('billingEvents').countDocuments({})).toBe(1);
  });

  it('ignores an older event that arrives after a newer one', async () => {
    await webhook(subscription({ plan: 'max', created: T0 + 100 }));
    await webhook(subscription({ plan: 'plus', created: T0 + 10 }));
    expect((await w.call('get', '/billing', undefined, { token: user.token })).body.plan).toBe('max');
  });

  it('finds the user by Stripe customer when the metadata is missing', async () => {
    await webhook(subscription({ created: T0 }));
    await webhook(subscription({ userId: null, status: 'active', cancelAtPeriodEnd: true, created: T0 + 5 }));
    const billing = (await w.call('get', '/billing', undefined, { token: user.token })).body;
    expect(billing.cancelAtPeriodEnd).toBe(true);
  });

  it('keeps the plan to the end of the period after a failed payment or a cancellation, then drops it', async () => {
    await webhook(subscription({ created: T0 }));
    await webhook({ id: 'evt_fail', created: T0 + 1, type: 'payment_failed', customerId: 'cus_1', subscriptionId: 'sub_1' });
    expect((await w.call('get', '/billing', undefined, { token: user.token })).body.plan).toBe('pro');
    await webhook(subscription({ created: T0 + 2, status: 'canceled', cancelAtPeriodEnd: false }));
    expect((await w.call('get', '/billing', undefined, { token: user.token })).body.plan).toBe('pro');
    w.ctx.clock.now = new Date((T0 + 31 * 86_400) * 1000);
    const later = await w.relogin(user); // the old token expired while the clock moved
    expect((await w.call('get', '/billing', undefined, { token: later.token })).body.plan).toBe('free');
  });

  it('acknowledges an event for an unknown user without changing anyone', async () => {
    const event = subscription({ userId: 'not-an-id', customerId: null });
    const res = await webhook(event);
    expect(res.status).toBe(200); // unknown user: logged and acknowledged
    expect(await w.db.collection('users').countDocuments({ billing: { $exists: true } })).toBe(0);
  });
});

describe('limits by plan', () => {
  const upload = (size: number, token = user.token) => w.call('post', '/uploads', { fileName: 'a.mp4', size, contentType: 'video/mp4' }, { token });

  it('stops a free account at 2 GiB and lets a Pro account through', async () => {
    const big = await upload(3 * GIB);
    expect(big.status).toBe(403);
    expect(big.body.error).toMatchObject({ code: 'PLAN_LIMIT', details: { limit: 'uploadBytes', maxBytes: 2 * GIB, plan: 'free' } });
    expect((await upload(1 * GIB)).status).toBe(201);
    await webhook(subscription({ plan: 'pro' }));
    expect((await upload(3 * GIB)).status).toBe(201);
  });

  it('keeps the 20 GiB cap for accounts created before the plans existed', async () => {
    const old = await w.user('old@example.com');
    await w.db.collection('users').updateOne({ _id: new ObjectId(old.id) }, { $set: { createdAt: new Date('2026-10-01T00:00:00Z') } });
    expect((await upload(10 * GIB, old.token)).status).toBe(201);
  });

  it('caps membership tiers by plan', async () => {
    const tier = (level: number) => w.call('post', '/me/tiers', { name: `T${level}`, price: 10000 * level, level, perks: ['badge'] }, { token: user.token });
    expect((await tier(1)).status).toBe(201);
    expect((await tier(2)).status).toBe(201);
    const third = await tier(3);
    expect(third.status).toBe(403);
    expect(third.body.error).toMatchObject({ code: 'PLAN_LIMIT', details: { limit: 'tiers', max: 2 } });
    await webhook(subscription({ plan: 'plus' }));
    expect((await tier(3)).status).toBe(201);
  });

  it('shortens the analytics window of a free account', async () => {
    const res = await w.call('get', '/me/analytics?days=365', undefined, { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.days.length).toBeLessThanOrEqual(28);
  });
});
