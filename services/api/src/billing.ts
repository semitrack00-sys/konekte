import Stripe from 'stripe';
import { z } from 'zod';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { hashToken } from './crypto.js';
export interface CheckoutInput { paymentId: string; amountCents: number; currency: string; planName: string }
export interface BillingService {
  readonly mode: 'mock' | 'stripe_test';
  createCheckout(input: CheckoutInput): Promise<{ reference: string; url: string | null }>;
  verifyEvent(raw: Buffer, signature: string): VerifiedPaymentEvent | null;
}
const eventSchema = z.object({
  id: z.string().min(1), type: z.string(), livemode: z.literal(false),
  data: z.object({ object: z.object({
    id: z.string().min(1), metadata: z.object({ paymentId: z.string().uuid() }),
    amount_total: z.number().int().nonnegative(), currency: z.string(),
    payment_status: z.enum(['paid', 'unpaid', 'no_payment_required']), mode: z.literal('payment')
  }) })
});
export interface VerifiedPaymentEvent { id: string; type: string; paymentId: string; reference: string; amountCents: number; currency: string; outcome: 'success' | 'failure' }
const supported = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']);
function verify(raw: Buffer, signature: string, secret: string): VerifiedPaymentEvent | null {
  let verified: Stripe.Event;
  try { verified = Stripe.webhooks.constructEvent(raw, signature, secret, 300); }
  catch { throw new AppError(400, 'INVALID_SIGNATURE', 'Payment verification failed.'); }
  if (verified.livemode) throw new AppError(400, 'LIVE_EVENT_REJECTED', 'Only test payments are supported.');
  if (!supported.has(verified.type)) return null;
  const parsed = eventSchema.safeParse(verified);
  if (!parsed.success) throw new AppError(400, 'INVALID_EVENT', 'Payment details are invalid.');
  const event = parsed.data;
  const session = event.data.object;
  const success = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
  // Delayed payment methods can complete checkout before money is received.
  if (success && session.payment_status !== 'paid') return null;
  if (!success && session.payment_status === 'paid') throw new AppError(400, 'INVALID_EVENT', 'Payment details are inconsistent.');
  return { id: event.id, type: event.type, paymentId: session.metadata.paymentId, reference: session.id, amountCents: session.amount_total, currency: session.currency, outcome: success ? 'success' : 'failure' };
}
export class MockBillingService implements BillingService {
  readonly mode = 'mock';
  constructor(private secret: string) {}
  async createCheckout(input: CheckoutInput) { return { reference: `mock_checkout_${input.paymentId}`, url: null }; }
  verifyEvent(raw: Buffer, signature: string) { return verify(raw, signature, this.secret); }
  signedEvent(input: CheckoutInput, outcome: 'success' | 'failure', eventId = `mock_event_${input.paymentId}_${outcome}`) {
    const body = JSON.stringify({ id: eventId, object: 'event', livemode: false,
      type: outcome === 'success' ? 'checkout.session.completed' : 'checkout.session.async_payment_failed',
      data: { object: { id: `mock_checkout_${input.paymentId}`, mode: 'payment', metadata: { paymentId: input.paymentId }, amount_total: input.amountCents, currency: input.currency, payment_status: outcome === 'success' ? 'paid' : 'unpaid' } }
    });
    return { body, signature: Stripe.webhooks.generateTestHeaderString({ payload: body, secret: this.secret }) };
  }
}
export class StripeTestBillingService implements BillingService {
  readonly mode = 'stripe_test';
  private stripe: Stripe;
  constructor(key: string, private secret: string, private returnUrl: string) {
    if (!key.startsWith('sk_test_')) throw new Error('Stripe live keys are disabled.');
    this.stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
  }
  async createCheckout(input: CheckoutInput) {
    const session = await this.stripe.checkout.sessions.create({ mode: 'payment',
      success_url: `${this.returnUrl}?result=success`, cancel_url: `${this.returnUrl}?result=canceled`,
      client_reference_id: input.paymentId, metadata: { paymentId: input.paymentId },
      line_items: [{ quantity: 1, price_data: { currency: input.currency, unit_amount: input.amountCents, product_data: { name: `${input.planName} (PLACEHOLDER_PRICING)` } } }]
    }, { idempotencyKey: input.paymentId });
    if (session.livemode || !session.url) throw new AppError(502, 'CHECKOUT_UNAVAILABLE', 'Test payment is unavailable.');
    return { reference: session.id, url: session.url };
  }
  verifyEvent(raw: Buffer, signature: string) { return verify(raw, signature, this.secret); }
}
export function createBilling(config: Config): BillingService {
  if (config.NODE_ENV === 'production') throw new Error('Production billing disabled.');
  return config.BILLING_MODE === 'mock'
    ? new MockBillingService(hashToken(`mock-webhook:${config.ACCESS_TOKEN_SECRET}`))
    : new StripeTestBillingService(config.STRIPE_SECRET_KEY!, config.STRIPE_WEBHOOK_SECRET!, config.CHECKOUT_RETURN_URL);
}
