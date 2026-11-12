/**
 * Platform plans and what each one allows. This file is the single source for limits: other
 * code asks `entitlements(user, now)` and never branches on a plan id itself. Prices are in VND
 * (a zero-decimal currency, so the amount is sent to Stripe as it is).
 */
export const PLAN_IDS = ['free', 'plus', 'pro', 'max'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PaidPlanId = Exclude<PlanId, 'free'>;

const GIB = 1024 ** 3;

export interface Entitlements {
  /** Largest single upload in bytes (the global hard cap still applies on top). */
  maxUploadBytes: number;
  /** Membership tiers a channel may offer at the same time. */
  maxTiers: number;
  /** Longest analytics window the Studio may ask for, in days. */
  analyticsDays: number;
}

export interface PlanDef extends Entitlements {
  id: PlanId;
  priceVnd: number;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: 'free', priceVnd: 0, maxUploadBytes: 2 * GIB, maxTiers: 2, analyticsDays: 28 },
  plus: { id: 'plus', priceVnd: 49_000, maxUploadBytes: 5 * GIB, maxTiers: 3, analyticsDays: 90 },
  pro: { id: 'pro', priceVnd: 99_000, maxUploadBytes: 20 * GIB, maxTiers: 5, analyticsDays: 365 },
  max: { id: 'max', priceVnd: 199_000, maxUploadBytes: 20 * GIB, maxTiers: 10, analyticsDays: 365 },
};

export const PLAN_LIST: readonly PlanDef[] = [PLANS.free, PLANS.plus, PLANS.pro, PLANS.max];
export const planDef = (id: PlanId): PlanDef => PLAN_LIST.find((p) => p.id === id) ?? PLANS.free;

/** Accounts created before this instant keep the Pro limits on the free plan, so nobody loses a right they had. */
export const LEGACY_BEFORE = new Date('2026-11-13T00:00:00Z');
const LEGACY: Entitlements = { maxUploadBytes: PLANS.pro.maxUploadBytes, maxTiers: PLANS.pro.maxTiers, analyticsDays: PLANS.pro.analyticsDays };

export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && (PLAN_IDS as readonly string[]).includes(v);
export const isPaidPlan = (v: unknown): v is PaidPlanId => isPlanId(v) && v !== 'free';

/** What Stripe tells us about a user's subscription, kept on the user document. */
export interface BillingState {
  plan: PaidPlanId;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  subscriptionId: string | null;
  /** Stripe event time (seconds) of the last update applied, so an older event cannot overwrite a newer one. */
  eventAt: number;
}

export interface PlanSubject {
  createdAt: Date;
  billing?: BillingState | null;
}

/** A paid plan counts while Stripe reports it active, or until the paid period ends. */
export function activePlan(user: PlanSubject, now: Date): PlanId {
  const b = user.billing;
  if (!b || !isPaidPlan(b.plan)) return 'free';
  if (b.status === 'active' || b.status === 'trialing') return b.plan;
  return b.currentPeriodEnd && b.currentPeriodEnd.getTime() > now.getTime() ? b.plan : 'free';
}

export function entitlements(user: PlanSubject, now: Date): Entitlements & { plan: PlanId } {
  const plan = activePlan(user, now);
  const base = planDef(plan);
  const legacy = plan === 'free' && user.createdAt.getTime() < LEGACY_BEFORE.getTime();
  const e = legacy ? LEGACY : base;
  return { plan, maxUploadBytes: e.maxUploadBytes, maxTiers: e.maxTiers, analyticsDays: e.analyticsDays };
}
