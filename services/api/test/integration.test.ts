import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import Stripe from 'stripe';
import type { FastifyInstance } from 'fastify';
import type { Checkout, Device, Esim, Subscription, Tokens, Usage } from '@konekte/shared-types';
import { MockEsimProvider } from '@konekte/esim-provider-sdk';
import { buildApp } from '../src/app.js';
import { MockBillingService } from '../src/billing.js';
import { readConfig } from '../src/config.js';
import { seedPlans } from '../src/seed.js';
import { Workflows } from '../src/workflows.js';
if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== '/konekte_test') throw new Error('Tests require the dedicated konekte_test database.');
const db = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
const signingSecret = randomBytes(32).toString('hex');
const billing = new MockBillingService(signingSecret);
const provider = new MockEsimProvider();
const config = readConfig({ ...process.env, NODE_ENV: 'test', ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'), ACTIVATION_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
let app: FastifyInstance;
let workflow: Workflows;
const auth = (tokens: Tokens) => ({ authorization: `Bearer ${tokens.accessToken}` });
const password = randomBytes(20).toString('hex');
async function register(email = `${randomUUID()}@example.test`): Promise<Tokens> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password, locale: 'ht' } });
  expect(response.statusCode).toBe(201); return response.json<Tokens>();
}
async function device(tokens: Tokens, compatible = true): Promise<Device> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/devices', headers: auth(tokens), payload: { name: 'Test phone', supportsEsim: compatible, unlocked: true } });
  expect(response.statusCode).toBe(201); return response.json<Device>();
}
async function checkout(tokens: Tokens, key = randomUUID(), deviceId?: string) {
  const id = deviceId ?? (await device(tokens)).id;
  return app.inject({ method: 'POST', url: '/api/v1/checkout', headers: { ...auth(tokens), 'idempotency-key': key }, payload: { planId: 'basic', deviceId: id } });
}
async function prepared() {
  const tokens = await register(); const result = await checkout(tokens); expect(result.statusCode).toBe(200);
  return { tokens, checkout: result.json<Checkout>() };
}
async function signed(paymentId: string, outcome: 'success' | 'failure' = 'success', eventId?: string) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return billing.signedEvent({ paymentId, amountCents: payment.amountCents, currency: payment.currency, planName: 'Konekte Basic' }, outcome, eventId);
}
async function webhook(body: string, signature: string) {
  return app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload: body });
}
async function pay(paymentId: string, outcome: 'success' | 'failure' = 'success', eventId?: string) {
  const event = await signed(paymentId, outcome, eventId); return webhook(event.body, event.signature);
}
async function provisioned() {
  const setup = await prepared(); expect((await pay(setup.checkout.paymentId)).statusCode).toBe(200);
  await workflow.runProvisioningOnce();
  const esim = await db.esim.findUniqueOrThrow({ where: { subscriptionId: setup.checkout.subscriptionId } });
  return { ...setup, esim };
}
async function step(tokens: Tokens, id: string, action: string) {
  return app.inject({ method: 'POST', url: `/api/v1/esims/${id}/installation`, headers: auth(tokens), payload: { action } });
}
beforeAll(async () => {
  const built = await buildApp({ db, redis, provider, billing, config }); app = built.app; workflow = built.workflow; await app.ready();
});
beforeEach(async () => {
  // Guard above prevents accidental truncation of development or production databases.
  await db.$executeRawUnsafe('TRUNCATE TABLE "Usage", "ProvisioningJob", "Esim", "WebhookEvent", "Payment", "Subscription", "Device", "Session", "User", "Plan" CASCADE');
  const keys = await redis.keys('konekte:test:rate:*'); if (keys.length) await redis.del(...keys);
  vi.restoreAllMocks(); await seedPlans(db);
});
afterAll(async () => { await app?.close(); await db.$disconnect(); redis.disconnect(); });
describe('auth and catalog', () => {
  it('registers, hashes the password, and returns a short-lived access token', async () => {
    const tokens = await register('Person@Example.test'); const user = await db.user.findUniqueOrThrow({ where: { id: tokens.user.id } });
    expect(user.email).toBe('person@example.test'); expect(user.passwordHash).not.toBe(password); expect(tokens.user.locale).toBe('ht');
    const payload = app.jwt.decode<{ exp: number; iat: number }>(tokens.accessToken)!; expect(payload.exp - payload.iat).toBe(600);
    const session = await db.session.findFirstOrThrow(); expect(session.tokenHash).not.toBe(tokens.refreshToken);
    expect((await app.inject({ url: '/api/v1/me', headers: auth(tokens) })).json()).toEqual(tokens.user);
  });
  it('logs in and rejects incorrect credentials with a safe error', async () => {
    const tokens = await register();
    const valid = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: tokens.user.email, password } }); expect(valid.statusCode).toBe(200);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: tokens.user.email, password: 'not-the-right-password' } });
    expect(invalid.statusCode).toBe(401); expect(invalid.json().error.code).toBe('INVALID_CREDENTIALS'); expect(invalid.body).not.toContain('passwordHash');
  });
  it('rejects duplicate emails and weak passwords', async () => {
    await register('same@example.test');
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'same@example.test', password } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'new@example.test', password: 'short' } })).statusCode).toBe(400);
  });
  it('rotates refresh tokens and revokes the family on replay', async () => {
    const tokens = await register();
    const rotated = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: tokens.refreshToken } }); expect(rotated.statusCode).toBe(200);
    const next = rotated.json<Tokens>(); expect(next.refreshToken).not.toBe(tokens.refreshToken);
    expect((await app.inject({ url: '/api/v1/me', headers: auth(next) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: tokens.refreshToken } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/v1/me', headers: auth(next) })).statusCode).toBe(401);
  });
  it('revokes access on logout and rejects expired tokens', async () => {
    const tokens = await register();
    const current = app.jwt.decode<{ sub: string; sid: string }>(tokens.accessToken)!;
    const expired = app.jwt.sign({ sub: current.sub, sid: current.sid }, { expiresIn: -1 });
    expect((await app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${expired}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: auth(tokens) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/me', headers: auth(tokens) })).statusCode).toBe(401);
  });
  it('lists exactly the three development plans with placeholder pricing', async () => {
    const response = await app.inject({ url: '/api/v1/plans' }); expect(response.statusCode).toBe(200);
    expect(response.json().map((p: { priceCents: number }) => p.priceCents)).toEqual([999, 1499, 1999]);
    expect(response.json().map((p: { dataGb: number }) => p.dataGb)).toEqual([10, 30, 50]);
    for (const plan of response.json()) expect(plan).toMatchObject({ pricingLabel: 'PLACEHOLDER_PRICING', durationDays: 30 });
  });
  it('requires authentication on every customer API group', async () => {
    for (const url of ['/api/v1/me', '/api/v1/devices', '/api/v1/subscriptions', '/api/v1/esims', '/api/v1/usage']) expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/checkout', payload: {} })).statusCode).toBe(401);
  });
  it('enforces Redis-backed rate limiting', async () => {
    const responses = [];
    for (let i = 0; i < 11; i++) responses.push(await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} }));
    expect(responses[10]?.statusCode).toBe(429); expect(responses[10]?.json().error.code).toBe('RATE_LIMITED');
  });
  it('reports database and Redis readiness', async () => {
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/health/ready' })).json()).toEqual({ status: 'ready' });
    vi.spyOn(redis, 'ping').mockRejectedValueOnce(new Error('secret-internal-error'));
    const down = await app.inject({ url: '/health/ready' }); expect(down.statusCode).toBe(503); expect(down.body).not.toContain('secret-internal-error');
  });
});
describe('checkout and verified payment', () => {
  it('blocks checkout for an incompatible phone', async () => {
    const tokens = await register(); const d = await device(tokens, false); expect((await checkout(tokens, randomUUID(), d.id)).statusCode).toBe(409);
    expect(await db.payment.count()).toBe(0);
  });
  it('uses server-side prices and rejects price injection', async () => {
    const tokens = await register(); const d = await device(tokens);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/checkout', headers: { ...auth(tokens), 'idempotency-key': randomUUID() }, payload: { planId: 'basic', deviceId: d.id, priceCents: 1 } }); expect(invalid.statusCode).toBe(400);
    const result = await checkout(tokens, randomUUID(), d.id); expect(result.statusCode).toBe(200);
    expect((await db.payment.findFirstOrThrow()).amountCents).toBe(999); expect(await db.esim.count()).toBe(0);
  });
  it('deduplicates concurrent checkout requests', async () => {
    const tokens = await register(); const d = await device(tokens); const key = randomUUID();
    const [a, b] = await Promise.all([checkout(tokens, key, d.id), checkout(tokens, key, d.id)]);
    expect(a.statusCode).toBe(200); expect(b.statusCode).toBe(200); expect(a.json().paymentId).toBe(b.json().paymentId); expect(await db.payment.count()).toBe(1);
  });
  it('rejects reuse of a checkout key for another selection', async () => {
    const tokens = await register(); const d = await device(tokens); const key = randomUUID(); await checkout(tokens, key, d.id);
    const response = await app.inject({ method: 'POST', url: '/api/v1/checkout', headers: { ...auth(tokens), 'idempotency-key': key }, payload: { planId: 'plus', deviceId: d.id } }); expect(response.statusCode).toBe(409);
  });
  it('queues provisioning only after a signed successful payment', async () => {
    const p = await prepared(); expect(await db.provisioningJob.count()).toBe(0); expect((await pay(p.checkout.paymentId)).statusCode).toBe(200);
    expect((await db.payment.findFirstOrThrow()).state).toBe('SUCCEEDED'); expect(await db.provisioningJob.count()).toBe(1);
    expect((await db.subscription.findFirstOrThrow()).state).toBe('PENDING');
  });
  it('records payment failure without provisioning', async () => {
    const p = await prepared(); expect((await pay(p.checkout.paymentId, 'failure')).statusCode).toBe(200);
    expect((await db.payment.findFirstOrThrow()).state).toBe('FAILED'); expect((await db.subscription.findFirstOrThrow()).state).toBe('PAST_DUE'); expect(await db.esim.count()).toBe(0);
  });
  it('handles concurrent duplicate Stripe events idempotently', async () => {
    const p = await prepared(); const event = await signed(p.checkout.paymentId);
    const results = await Promise.all([webhook(event.body, event.signature), webhook(event.body, event.signature)]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]); expect(await db.webhookEvent.count()).toBe(1); expect(await db.esim.count()).toBe(1); expect(await db.provisioningJob.count()).toBe(1);
  });
  it('does not regress a successful payment on a late failure', async () => {
    const p = await prepared(); await pay(p.checkout.paymentId); await pay(p.checkout.paymentId, 'failure');
    expect((await db.payment.findFirstOrThrow()).state).toBe('SUCCEEDED'); expect(await db.provisioningJob.count()).toBe(1);
  });
  it('recovers a failed payment on a later verified success', async () => {
    const p = await prepared(); await pay(p.checkout.paymentId, 'failure'); await pay(p.checkout.paymentId);
    expect((await db.payment.findFirstOrThrow()).state).toBe('SUCCEEDED'); expect(await db.provisioningJob.count()).toBe(1);
  });
  it('rejects missing, invalid, and stale webhook signatures', async () => {
    const p = await prepared(); const event = await signed(p.checkout.paymentId);
    expect((await webhook(event.body, 'invalid')).statusCode).toBe(400);
    const stale = Stripe.webhooks.generateTestHeaderString({ payload: event.body, secret: signingSecret, timestamp: Math.floor(Date.now() / 1000) - 600 });
    expect((await webhook(event.body, stale)).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/webhooks/stripe', payload: {} })).statusCode).toBe(400); expect(await db.esim.count()).toBe(0);
  });
  it('rejects signed events with wrong amount, currency, reference or live mode', async () => {
    const p = await prepared(); const event = await signed(p.checkout.paymentId);
    for (const change of ['amount', 'currency', 'reference', 'live']) {
      const data = JSON.parse(event.body);
      if (change === 'amount') data.data.object.amount_total = 1;
      if (change === 'currency') data.data.object.currency = 'eur';
      if (change === 'reference') data.data.object.id = 'another-checkout';
      if (change === 'live') data.livemode = true;
      const body = JSON.stringify(data); const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: signingSecret });
      expect((await webhook(body, signature)).statusCode).toBe(400);
    }
    expect(await db.esim.count()).toBe(0);
  });
  it('does not fulfill unpaid checkout completion', async () => {
    const p = await prepared(); const event = await signed(p.checkout.paymentId); const data = JSON.parse(event.body); data.data.object.payment_status = 'unpaid';
    const body = JSON.stringify(data); expect((await webhook(body, Stripe.webhooks.generateTestHeaderString({ payload: body, secret: signingSecret }))).statusCode).toBe(200);
    expect((await db.payment.findFirstOrThrow()).state).toBe('PENDING'); expect(await db.provisioningJob.count()).toBe(0);
  });
  it('ignores unsupported signed event types', async () => {
    const body = JSON.stringify({ id: 'unsupported-event', type: 'customer.created', livemode: false, data: { object: {} } });
    expect((await webhook(body, Stripe.webhooks.generateTestHeaderString({ payload: body, secret: signingSecret }))).statusCode).toBe(200); expect(await db.webhookEvent.count()).toBe(0);
  });
});
describe('eSIM workflow and authorization', () => {
  it('provisions encrypted installation data and exposes a safe owner response', async () => {
    const p = await provisioned(); expect(p.esim.state).toBe('READY'); expect(p.esim.installationState).toBe('READY_TO_INSTALL'); expect(p.esim.activationCipher).not.toContain('mock.invalid');
    const install = await app.inject({ url: `/api/v1/esims/${p.esim.id}/installation`, headers: auth(p.tokens) }); expect(install.statusCode).toBe(200); expect(install.json().simulated).toBe(true);
    const list = await app.inject({ url: '/api/v1/esims', headers: auth(p.tokens) }); expect(list.body).not.toContain('activationCipher'); expect(list.body).not.toContain('providerReference');
    expect(list.headers['cache-control']).toBe('no-store');
  });
  it('prevents duplicate provisioning across workers and event IDs', async () => {
    const p = await prepared(); await pay(p.checkout.paymentId); await pay(p.checkout.paymentId, 'success', 'another-event');
    const spy = vi.spyOn(provider, 'provision'); await Promise.all([workflow.runProvisioningOnce(), workflow.runProvisioningOnce()]);
    expect(spy).toHaveBeenCalledTimes(1); expect(await db.esim.count()).toBe(1); expect((await db.provisioningJob.findFirstOrThrow()).state).toBe('COMPLETE');
    expect(await workflow.runProvisioningOnce()).toBe(false);
  });
  it('reclaims a stale worker lease using the same provider idempotency key', async () => {
    const p = await prepared(); await pay(p.checkout.paymentId);
    const job = await db.provisioningJob.findFirstOrThrow(); await db.provisioningJob.update({ where: { id: job.id }, data: { state: 'RUNNING', leaseUntil: new Date(0), leaseToken: 'lost-worker' } });
    const spy = vi.spyOn(provider, 'provision'); await workflow.runProvisioningOnce();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: p.checkout.subscriptionId })); expect((await db.provisioningJob.findFirstOrThrow()).state).toBe('COMPLETE');
  });
  it('retries provider failure, stores only a safe error, and permits owner recovery', async () => {
    const p = await prepared(); await pay(p.checkout.paymentId);
    vi.spyOn(provider, 'provision').mockRejectedValue(new Error('raw-provider-secret-must-not-leak'));
    for (let i = 0; i < 3; i++) { await db.provisioningJob.updateMany({ data: { availableAt: new Date(0) } }); await workflow.runProvisioningOnce(); }
    const job = await db.provisioningJob.findFirstOrThrow(); expect(job.state).toBe('FAILED'); expect(job.lastError).toBe('PROVIDER_UNAVAILABLE');
    const esim = await db.esim.findFirstOrThrow(); expect(esim.state).toBe('ERROR'); expect(esim.installationState).toBe('FAILED');
    expect((await app.inject({ method: 'POST', url: `/api/v1/esims/${esim.id}/retry`, headers: auth(p.tokens) })).statusCode).toBe(200);
    vi.restoreAllMocks(); await workflow.runProvisioningOnce(); expect((await db.esim.findFirstOrThrow()).state).toBe('READY');
  });
  it('requires installation order and supports idempotent activation', async () => {
    const p = await provisioned(); expect((await step(p.tokens, p.esim.id, 'activate')).statusCode).toBe(409);
    for (const action of ['start-install', 'confirm-install', 'activate', 'activate']) expect((await step(p.tokens, p.esim.id, action)).statusCode).toBe(200);
    const esim = await db.esim.findFirstOrThrow(); expect(esim.installationState).toBe('ACTIVE'); expect(esim.simulated).toBe(true);
    const sub = await db.subscription.findFirstOrThrow(); expect(sub.state).toBe('ACTIVE'); expect(sub.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
  it('rolls back failed activation without claiming service is active', async () => {
    const p = await provisioned(); await step(p.tokens, p.esim.id, 'start-install'); await step(p.tokens, p.esim.id, 'confirm-install');
    vi.spyOn(provider, 'activate').mockRejectedValueOnce(new Error('provider-secret'));
    const response = await step(p.tokens, p.esim.id, 'activate'); expect(response.statusCode).toBe(502); expect(response.body).not.toContain('provider-secret');
    expect((await db.esim.findFirstOrThrow()).installationState).toBe('INSTALLED'); expect((await db.subscription.findFirstOrThrow()).state).toBe('PENDING');
  });
  it('reports simulated usage with a plan allowance and persisted measurement', async () => {
    const p = await provisioned(); for (const action of ['start-install', 'confirm-install', 'activate']) await step(p.tokens, p.esim.id, action);
    const response = await app.inject({ url: '/api/v1/usage', headers: auth(p.tokens) }); expect(response.statusCode).toBe(200);
    expect(response.json<Usage[]>()[0]).toMatchObject({ usedBytes: 256_000_000, totalBytes: 10_000_000_000, simulated: true }); expect(await db.usage.count()).toBe(1);
    await app.inject({ url: '/api/v1/usage', headers: auth(p.tokens) }); expect(await db.usage.count()).toBe(1);
  });
  it('expires a completed plan and prevents reactivation', async () => {
    const p = await provisioned(); for (const action of ['start-install', 'confirm-install', 'activate']) await step(p.tokens, p.esim.id, action);
    await db.subscription.update({ where: { id: p.checkout.subscriptionId }, data: { expiresAt: new Date(0) } }); await workflow.expireSubscriptions();
    expect((await db.subscription.findFirstOrThrow()).state).toBe('EXPIRED'); expect((await db.esim.findFirstOrThrow()).state).toBe('EXPIRED'); expect((await step(p.tokens, p.esim.id, 'activate')).statusCode).toBe(409);
  });
  it('isolates devices, subscriptions, activation fields, payments and usage between users', async () => {
    const p = await provisioned(); const outsider = await register(); const owned = await db.device.findFirstOrThrow({ where: { userId: p.tokens.user.id } });
    expect((await checkout(outsider, randomUUID(), owned.id)).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/subscriptions', headers: auth(outsider) })).json<Subscription[]>()).toEqual([]);
    expect((await app.inject({ url: '/api/v1/esims', headers: auth(outsider) })).json<Esim[]>()).toEqual([]);
    expect((await app.inject({ url: `/api/v1/esims/${p.esim.id}/installation`, headers: auth(outsider) })).statusCode).toBe(404);
    expect((await step(outsider, p.esim.id, 'start-install')).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/v1/esims/${p.esim.id}/retry`, headers: auth(outsider) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/v1/checkout/${p.checkout.paymentId}/simulate`, headers: auth(outsider), payload: { outcome: 'success' } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/v1/usage?esimId=${p.esim.id}`, headers: auth(outsider) })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/devices', headers: auth(outsider) })).json()).toEqual([]);
  });
});
