/**
 * Platform plans: the public plan list, Stripe Checkout, the customer portal and the webhook.
 * Only the webhook changes a user's plan, never the browser. Each Stripe event is applied once
 * (its id is the _id of a `billingEvents` document) and an older event never overwrites a newer
 * one (`billing.eventAt`).
 */
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Feature } from '../app.js';
import { badRequest, conflict, HttpError } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import type { UserDoc } from '../model/user.js';
import type { BillingEvent } from '../services/billing.js';
import { activePlan, entitlements, isPaidPlan, PLAN_LIST, type BillingState } from '../billing/plans.js';

const checkoutBody = z.object({ plan: z.string() });

export const billingFeature: Feature = (r, deps) => {
  const { db, now, kv, config, billing, log } = deps;
  const users = db.collection<UserDoc>('users');
  const events = db.collection<{ _id: string; at: Date }>('billingEvents');
  const limit = (scope: string, max: number, windowSec: number) => rateLimit(kv, config.tables.rateLimits, { scope, limit: max, windowSec }, now);

  r.get('/plans', (_req, res) => {
    res.json({
      enabled: billing.enabled,
      currency: 'VND',
      plans: PLAN_LIST.map((p) => ({
        id: p.id, priceVnd: p.priceVnd,
        limits: { maxUploadBytes: p.maxUploadBytes, maxTiers: p.maxTiers, analyticsDays: p.analyticsDays, autoCaptionMinutes: p.autoCaptionMinutes, autoCaptionMaxVideoMinutes: p.autoCaptionMaxVideoMinutes, priorityTranscode: p.priorityTranscode },
      })),
    });
  });

  r.get('/billing', requireUser, async (req, res) => {
    const u = await users.findOne({ _id: new ObjectId(req.user?.id) });
    if (!u) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue');
    const e = entitlements(u, now());
    res.json({
      enabled: billing.enabled,
      plan: e.plan,
      renewsAt: u.billing?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: u.billing?.cancelAtPeriodEnd ?? false,
      hasCustomer: Boolean(u.billing?.customerId),
      limits: { maxUploadBytes: e.maxUploadBytes, maxTiers: e.maxTiers, analyticsDays: e.analyticsDays, autoCaptionMinutes: e.autoCaptionMinutes, autoCaptionMaxVideoMinutes: e.autoCaptionMaxVideoMinutes, priorityTranscode: e.priorityTranscode },
    });
  });

  r.post('/billing/checkout', requireUser, limit('checkout', 10, 3600), async (req, res) => {
    const body = checkoutBody.parse(req.body);
    if (!isPaidPlan(body.plan)) throw badRequest('INVALID_PLAN', 'Choose Plus, Pro or Max');
    const u = await users.findOne({ _id: new ObjectId(req.user?.id) });
    if (!u) throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue');
    if (!u.emailVerified) throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Verify your e-mail before paying');
    if (activePlan(u, now()) !== 'free') throw conflict('ALREADY_SUBSCRIBED', 'Change or cancel your plan in the billing portal');
    const out = await billing.createCheckout({
      userId: u._id.toHexString(), email: u.email, plan: body.plan, customerId: u.billing?.customerId ?? null,
      successUrl: `${config.webBaseUrl}/settings?tab=billing&billing=success`, cancelUrl: `${config.webBaseUrl}/plans`,
    });
    res.json(out);
  });

  r.post('/billing/portal', requireUser, limit('portal', 20, 3600), async (req, res) => {
    const u = await users.findOne({ _id: new ObjectId(req.user?.id) });
    const customerId = u?.billing?.customerId;
    if (!customerId) throw new HttpError(409, 'NO_CUSTOMER', 'You have no subscription to manage yet');
    res.json(await billing.createPortal(customerId, `${config.webBaseUrl}/settings?tab=billing`));
  });

  async function findUser(userId: string | null, customerId: string | null): Promise<UserDoc | null> {
    if (userId && /^[a-f0-9]{24}$/.test(userId)) {
      const byId = await users.findOne({ _id: new ObjectId(userId) });
      if (byId) return byId;
    }
    return customerId ? users.findOne({ 'billing.customerId': customerId }) : null;
  }

  /** Applies one event; returns false when it was already applied or refers to nobody. */
  async function apply(event: BillingEvent): Promise<boolean> {
    if (event.type === 'ignored') return true;
    const user = await findUser(event.type === 'payment_failed' ? null : event.userId, event.customerId);
    if (!user) return false;
    const current = user.billing ?? null;
    if (current && event.created < current.eventAt) return true; // stale: a newer event is already in

    if (event.type === 'checkout') {
      const next = { ...(current ?? ({ plan: 'plus', status: 'incomplete', currentPeriodEnd: null, cancelAtPeriodEnd: false } as Partial<BillingState>)),
        customerId: event.customerId ?? current?.customerId ?? null,
        subscriptionId: event.subscriptionId ?? current?.subscriptionId ?? null,
        eventAt: Math.max(event.created, current?.eventAt ?? 0) };
      await users.updateOne({ _id: user._id }, { $set: { billing: next as BillingState, updatedAt: now() } });
      return true;
    }
    if (event.type === 'payment_failed') {
      if (current) await users.updateOne({ _id: user._id }, { $set: { 'billing.status': 'past_due', 'billing.eventAt': event.created, updatedAt: now() } });
      return true;
    }
    const plan = event.plan ?? current?.plan;
    if (!plan) return true;
    const next: BillingState = {
      plan, status: event.status, currentPeriodEnd: event.currentPeriodEnd ?? current?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      customerId: event.customerId ?? current?.customerId ?? null, subscriptionId: event.subscriptionId, eventAt: event.created,
    };
    await users.updateOne({ _id: user._id }, { $set: { billing: next, updatedAt: now() } });
    return true;
  }

  r.post('/billing/webhook', async (req, res) => {
    const signature = req.get('stripe-signature');
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!signature || !raw) throw badRequest('BAD_SIGNATURE', 'The webhook signature is missing');
    const event = billing.parseWebhook(raw, signature);

    try {
      await events.insertOne({ _id: event.id, at: now() });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return void res.json({ received: true, duplicate: true });
      throw err;
    }
    try {
      const known = await apply(event);
      if (!known) log({ level: 'warn', msg: 'billing event for an unknown user', eventId: event.id, type: event.type });
    } catch (err) {
      // Let Stripe retry: forget the id so the retry is not taken for a duplicate.
      await events.deleteOne({ _id: event.id }).catch(() => undefined);
      throw err;
    }
    res.json({ received: true });
  });
};
