import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { stripeBilling } from '../src/services/billing.js';

const SECRET = 'whsec_test_secret';
const gateway = stripeBilling('sk_test_unused', SECRET);
const signer = new Stripe('sk_test_unused');

function signed(payload: object) {
  const body = JSON.stringify(payload);
  return { raw: Buffer.from(body), header: signer.webhooks.generateTestHeaderString({ payload: body, secret: SECRET }) };
}

describe('Stripe gateway', () => {
  it('refuses a payload whose signature does not match', () => {
    const { raw } = signed({ id: 'evt_1', object: 'event', type: 'customer.subscription.updated', created: 1, data: { object: {} } });
    expect(() => gateway.parseWebhook(raw, 't=1,v1=deadbeef')).toThrow(/signature/i);
  });

  it('normalises a subscription event, reading the period end from the item', () => {
    const { raw, header } = signed({
      id: 'evt_2', object: 'event', type: 'customer.subscription.updated', created: 1_800_000_000,
      data: { object: {
        id: 'sub_9', customer: 'cus_9', status: 'active', cancel_at_period_end: true,
        metadata: { userId: '6af5494fcbf01de85ebfea13', plan: 'pro' },
        items: { data: [{ current_period_end: 1_802_592_000 }] },
      } },
    });
    expect(gateway.parseWebhook(raw, header)).toEqual({
      id: 'evt_2', created: 1_800_000_000, type: 'subscription', userId: '6af5494fcbf01de85ebfea13', customerId: 'cus_9',
      subscriptionId: 'sub_9', plan: 'pro', status: 'active', currentPeriodEnd: new Date(1_802_592_000 * 1000), cancelAtPeriodEnd: true,
    });
  });

  it('marks a deleted subscription canceled and reads an older top-level period end', () => {
    const { raw, header } = signed({
      id: 'evt_3', object: 'event', type: 'customer.subscription.deleted', created: 5,
      data: { object: { id: 'sub_9', customer: { id: 'cus_9' }, status: 'active', current_period_end: 99, metadata: { plan: 'bogus' } } },
    });
    expect(gateway.parseWebhook(raw, header)).toMatchObject({ type: 'subscription', status: 'canceled', plan: null, customerId: 'cus_9', currentPeriodEnd: new Date(99_000) });
  });

  it('reads the checkout session, the failed invoice, and ignores other events', () => {
    const checkout = signed({ id: 'evt_4', object: 'event', type: 'checkout.session.completed', created: 7, data: { object: { client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' } } });
    expect(gateway.parseWebhook(checkout.raw, checkout.header)).toMatchObject({ type: 'checkout', userId: 'u1', customerId: 'cus_1', subscriptionId: 'sub_1' });
    const failed = signed({ id: 'evt_5', object: 'event', type: 'invoice.payment_failed', created: 8, data: { object: { customer: 'cus_1', subscription: 'sub_1' } } });
    expect(gateway.parseWebhook(failed.raw, failed.header)).toMatchObject({ type: 'payment_failed', customerId: 'cus_1' });
    const other = signed({ id: 'evt_6', object: 'event', type: 'charge.succeeded', created: 9, data: { object: {} } });
    expect(gateway.parseWebhook(other.raw, other.header)).toEqual({ id: 'evt_6', created: 9, type: 'ignored' });
  });
});
