import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { EsimProvider } from '@konekte/esim-provider-sdk';
import type { BillingService, VerifiedPaymentEvent } from './billing.js';
import type { Config } from './config.js';
import { encrypt } from './crypto.js';
import { AppError, notFound } from './errors.js';
export async function lock(tx: Prisma.TransactionClient, key: string) {
  // Prisma cannot decode PostgreSQL's `void` result from pg_advisory_xact_lock.
  // Test for NULL in SQL so the driver only needs to decode a boolean.
  await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_advisory_xact_lock(hashtext(${key})) IS NULL AS acquired`;
}
export class Workflows {
  constructor(readonly db: PrismaClient, readonly provider: EsimProvider, readonly billing: BillingService, readonly config: Config) {}
  async checkout(userId: string, planId: string, deviceId: string, key: string) {
    const payment = await this.db.$transaction(async tx => {
      const checkoutKey = `${userId}:${key}`;
      await lock(tx, checkoutKey);
      const prior = await tx.payment.findUnique({ where: { checkoutKey }, include: { subscription: { include: { plan: true } } } });
      if (prior) {
        if (prior.subscription.planId !== planId || prior.subscription.deviceId !== deviceId) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Start a new payment for a different selection.');
        return prior;
      }
      const device = await tx.device.findFirst({ where: { id: deviceId, userId } });
      if (!device) notFound();
      if (!device.compatible) throw new AppError(409, 'INCOMPATIBLE_DEVICE', 'Check your phone before choosing a plan.');
      const plan = await tx.plan.findFirst({ where: { id: planId, enabled: true } });
      if (!plan) notFound();
      return tx.payment.create({ data: { checkoutKey, amountCents: plan.priceCents, currency: plan.currency, mode: this.billing.mode,
        subscription: { create: { userId, deviceId, planId } } }, include: { subscription: { include: { plan: true } } } });
    });
    if (payment.mode !== this.billing.mode) throw new AppError(409, 'BILLING_MODE_CHANGED', 'Start a new test payment.');
    if (!payment.checkoutReference) {
      // Stable provider idempotency key makes a crash between remote creation and local persistence safe.
      // Stripe retains keys for at least 24h; do not retry an ambiguous creation beyond that window.
      if (Date.now() - payment.createdAt.getTime() > 23 * 60 * 60 * 1000) throw new AppError(409, 'CHECKOUT_RECONCILIATION_REQUIRED', 'This payment needs review.');
      let checkout;
      try { checkout = await this.billing.createCheckout({ paymentId: payment.id, amountCents: payment.amountCents, currency: payment.currency, planName: payment.subscription.plan.name }); }
      catch { throw new AppError(502, 'CHECKOUT_UNAVAILABLE', 'Payment is unavailable. Please try again.'); }
      await this.db.payment.updateMany({ where: { id: payment.id, checkoutReference: null }, data: { checkoutReference: checkout.reference, checkoutUrl: checkout.url } });
    }
    const current = await this.db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return { paymentId: current.id, subscriptionId: current.subscriptionId, checkoutUrl: current.checkoutUrl, mode: this.billing.mode, state: current.state };
  }
  async acceptPayment(event: VerifiedPaymentEvent) {
    return this.db.$transaction(async tx => {
      await lock(tx, `payment:${event.paymentId}`);
      if (await tx.webhookEvent.findUnique({ where: { id: event.id } })) return { duplicate: true };
      const payment = await tx.payment.findUnique({ where: { id: event.paymentId }, include: { subscription: true } });
      if (!payment) throw new AppError(400, 'PAYMENT_UNKNOWN', 'Payment could not be verified.');
      if (!payment.checkoutReference) throw new AppError(503, 'CHECKOUT_NOT_READY', 'Payment verification will retry.');
      if (payment.mode !== this.billing.mode || payment.checkoutReference !== event.reference || payment.amountCents !== event.amountCents || payment.currency !== event.currency) throw new AppError(400, 'PAYMENT_MISMATCH', 'Payment details do not match.');
      // Success is terminal. A delayed failure must never revoke a verified payment.
      // A verified late success may recover a previous failed/past-due checkout.
      if (payment.state !== 'SUCCEEDED') {
        if (event.outcome === 'success') {
          await tx.payment.update({ where: { id: payment.id }, data: { state: 'SUCCEEDED' } });
          const esim = await tx.esim.upsert({ where: { subscriptionId: payment.subscriptionId }, update: {}, create: { subscriptionId: payment.subscriptionId, provider: this.provider.id, simulated: this.provider.capabilities.simulated } });
          await tx.provisioningJob.upsert({ where: { esimId: esim.id }, update: {}, create: { esimId: esim.id } });
          await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { state: 'PENDING' } });
        } else {
          await tx.payment.update({ where: { id: payment.id }, data: { state: 'FAILED' } });
          await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { state: 'PAST_DUE' } });
        }
      }
      await tx.webhookEvent.create({ data: { id: event.id, type: event.type, paymentId: payment.id } });
      return { duplicate: false };
    });
  }
  async runProvisioningOnce() {
    const leaseToken = randomUUID();
    const job = await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "ProvisioningJob"
        WHERE ((state = 'PENDING' AND "availableAt" <= NOW()) OR (state = 'RUNNING' AND "leaseUntil" < NOW()))
        ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`);
      if (!rows[0]) return null;
      const claimed = await tx.provisioningJob.update({ where: { id: rows[0].id }, data: { state: 'RUNNING', leaseUntil: new Date(Date.now() + 60_000), leaseToken, attempts: { increment: 1 } }, include: { esim: { include: { subscription: { include: { payment: true, plan: true } } } } } });
      await tx.esim.update({ where: { id: claimed.esimId }, data: { installationState: 'PROVISIONING' } });
      return claimed;
    });
    if (!job) return false;
    try {
      if (job.esim.subscription.payment?.state !== 'SUCCEEDED' || job.esim.provider !== this.provider.id) throw new Error('Provisioning precondition failed');
      const plan = job.esim.subscription.plan;
      const result = await this.provider.provision({ idempotencyKey: job.esim.subscriptionId, planCode: plan.id, dataGb: plan.dataGb, durationDays: plan.durationDays });
      await this.db.$transaction(async tx => {
        const completed = await tx.provisioningJob.updateMany({ where: { id: job.id, state: 'RUNNING', leaseToken }, data: { state: 'COMPLETE', leaseUntil: null, leaseToken: null, lastError: null } });
        if (completed.count !== 1) return;
        await tx.esim.update({ where: { id: job.esimId }, data: { providerReference: result.reference, state: result.state, installationState: 'READY_TO_INSTALL', activationCipher: encrypt(result.install, this.config.ACTIVATION_ENCRYPTION_KEY, job.esimId) } });
      });
    } catch {
      await this.db.$transaction(async tx => {
        const updated = await tx.provisioningJob.updateMany({ where: { id: job.id, state: 'RUNNING', leaseToken }, data: { state: job.attempts >= 3 ? 'FAILED' : 'PENDING', leaseUntil: null, leaseToken: null, lastError: 'PROVIDER_UNAVAILABLE', availableAt: new Date(Date.now() + 1000 * 2 ** job.attempts) } });
        if (updated.count) await tx.esim.update({ where: { id: job.esimId }, data: { state: 'ERROR', installationState: 'FAILED' } });
      });
    }
    return true;
  }
  async expireSubscriptions() {
    await this.db.$transaction(async tx => {
      const expired = await tx.subscription.findMany({ where: { state: 'ACTIVE', expiresAt: { lte: new Date() } }, select: { id: true } });
      const ids = expired.map(s => s.id);
      if (!ids.length) return;
      await tx.subscription.updateMany({ where: { id: { in: ids }, state: 'ACTIVE' }, data: { state: 'EXPIRED' } });
      await tx.esim.updateMany({ where: { subscriptionId: { in: ids }, state: 'ACTIVE' }, data: { state: 'EXPIRED' } });
    });
  }
  async installationAction(userId: string, id: string, action: 'start-install' | 'confirm-install' | 'activate') {
    return this.db.$transaction(async tx => {
      await lock(tx, `esim:${id}`);
      const esim = await tx.esim.findFirst({ where: { id, subscription: { userId } }, include: { subscription: { include: { plan: true, payment: true } } } });
      if (!esim) notFound();
      if (esim.subscription.payment?.state !== 'SUCCEEDED' || esim.provider !== this.provider.id || ['EXPIRED', 'SUSPENDED', 'TERMINATED'].includes(esim.state)) throw new AppError(409, 'INSTALLATION_UNAVAILABLE', 'Setup is not available.');
      // Client confirmations are ONLY permitted for a mock. Real adapters need trusted provider/device callbacks.
      if (!this.provider.capabilities.simulated) throw new AppError(409, 'PROVIDER_CONFIRMATION_REQUIRED', 'Waiting for confirmation from your service.');
      const transitions = { 'start-install': ['READY_TO_INSTALL', 'INSTALLING'], 'confirm-install': ['INSTALLING', 'INSTALLED'], activate: ['INSTALLED', 'ACTIVE'] } as const;
      const [from, to] = transitions[action];
      if (esim.installationState === to) return esim;
      if (esim.installationState !== from) throw new AppError(409, 'INVALID_TRANSITION', 'Finish the previous setup step first.');
      if (action === 'activate') {
        if (!esim.providerReference) throw new AppError(409, 'NOT_READY', 'Your setup is still being prepared.');
        await tx.esim.update({ where: { id }, data: { installationState: 'ACTIVATING' } });
        let result;
        try { result = await this.provider.activate(esim.providerReference); }
        catch { throw new AppError(502, 'ACTIVATION_FAILED', 'Activation is unavailable. Please try again.'); }
        if (result.state !== 'ACTIVE') throw new AppError(409, 'NOT_ACTIVE', 'Activation is still waiting for confirmation.');
        await tx.subscription.update({ where: { id: esim.subscriptionId }, data: { state: 'ACTIVE', expiresAt: new Date(Date.now() + esim.subscription.plan.durationDays * 86_400_000) } });
      }
      return tx.esim.update({ where: { id }, data: { installationState: to, state: action === 'activate' ? 'ACTIVE' : action === 'confirm-install' ? 'INSTALLED' : 'READY' } });
    }, { timeout: 20_000 });
  }
}
