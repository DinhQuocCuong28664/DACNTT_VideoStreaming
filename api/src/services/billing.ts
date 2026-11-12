/**
 * Stripe behind a small interface. The app only sees the normalised events below, so tests use
 * a fake and nothing outside this file touches the Stripe SDK. Without keys the gateway is
 * "disabled" and the billing routes answer 503.
 */
import Stripe from 'stripe';
import { HttpError } from '../http/errors.js';
import { isPaidPlan, planDef, type PaidPlanId } from '../billing/plans.js';

export type BillingEvent =
  | { id: string; created: number; type: 'checkout'; userId: string | null; customerId: string | null; subscriptionId: string | null }
  | {
      id: string; created: number; type: 'subscription'; userId: string | null; customerId: string | null; subscriptionId: string;
      plan: PaidPlanId | null; status: string; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean;
    }
  | { id: string; created: number; type: 'payment_failed'; customerId: string | null; subscriptionId: string | null }
  | { id: string; created: number; type: 'ignored' };

export interface CheckoutInput {
  userId: string;
  email: string;
  plan: PaidPlanId;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface Billing {
  enabled: boolean;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Throws when the signature does not match the raw body. */
  parseWebhook(rawBody: Buffer, signature: string): BillingEvent;
}

const disabled = () => new HttpError(503, 'BILLING_DISABLED', 'Payments are not configured');

export const disabledBilling: Billing = {
  enabled: false,
  createCheckout: async () => { throw disabled(); },
  createPortal: async () => { throw disabled(); },
  parseWebhook: () => { throw disabled(); },
};

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' ? str((v as Obj)['id']) : null);

/** Subscription fields move between Stripe API versions; read both places for the period end. */
function periodEnd(sub: Obj): Date | null {
  const items = (sub['items'] as { data?: Obj[] } | undefined)?.data ?? [];
  const seconds = [sub['current_period_end'], ...items.map((i) => i['current_period_end'])].find((v) => typeof v === 'number');
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

/**
 * A subscription that will end instead of renewing. Older API versions set `cancel_at_period_end`;
 * newer ones (flexible billing, which the customer portal uses) leave it false and set `cancel_at`.
 */
function cancelsLater(sub: Obj): boolean {
  return sub['cancel_at_period_end'] === true || typeof sub['cancel_at'] === 'number';
}

function normalise(event: Stripe.Event): BillingEvent {
  const base = { id: event.id, created: event.created };
  const obj = event.data.object as unknown as Obj;
  switch (event.type) {
    case 'checkout.session.completed':
      return {
        ...base, type: 'checkout',
        userId: str(obj['client_reference_id']) ?? str((obj['metadata'] as Obj | undefined)?.['userId']),
        customerId: idOf(obj['customer']), subscriptionId: idOf(obj['subscription']),
      };
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const meta = (obj['metadata'] as Obj | undefined) ?? {};
      const plan = meta['plan'];
      return {
        ...base, type: 'subscription',
        userId: str(meta['userId']), customerId: idOf(obj['customer']), subscriptionId: str(obj['id']) ?? '',
        plan: isPaidPlan(plan) ? plan : null,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : (str(obj['status']) ?? 'incomplete'),
        currentPeriodEnd: periodEnd(obj), cancelAtPeriodEnd: cancelsLater(obj),
      };
    }
    case 'invoice.payment_failed':
      return { ...base, type: 'payment_failed', customerId: idOf(obj['customer']), subscriptionId: idOf(obj['subscription']) };
    default:
      return { ...base, type: 'ignored' };
  }
}

export function stripeBilling(secretKey: string, webhookSecret: string): Billing {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
  return {
    enabled: true,
    async createCheckout(input) {
      const def = planDef(input.plan);
      const metadata = { userId: input.userId, plan: input.plan };
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: input.userId,
        ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'vnd',
            unit_amount: def.priceVnd,
            recurring: { interval: 'month' },
            product_data: { name: `VidShare ${input.plan.charAt(0).toUpperCase()}${input.plan.slice(1)}`, metadata },
          },
        }],
        metadata,
        subscription_data: { metadata },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });
      if (!session.url) throw new HttpError(502, 'BILLING_FAILED', 'Stripe returned no checkout address');
      return { url: session.url };
    },
    async createPortal(customerId, returnUrl) {
      const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: session.url };
    },
    parseWebhook(rawBody, signature) {
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        throw new HttpError(400, 'BAD_SIGNATURE', 'The webhook signature is invalid');
      }
      return normalise(event);
    },
  };
}
