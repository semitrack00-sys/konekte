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
  async reconcile() {
    const flags: Array<{ kind: 'PAID_BUT_NOT_PROVISIONED' | 'LOCAL_ACTIVE_PROVIDER_INACTIVE' | 'PROVIDER_ACTIVE_LOCAL_PENDING' | 'RENEWAL_PAID_PACKAGE_NOT_ASSIGNED' | 'USAGE_SYNC_STALE'; entityType: string; entityId: string; detail: string }> = [];
    const paid = await this.db.payment.findMany({ where: { state: 'SUCCEEDED' }, include: { subscription: { include: { esim: true } } }, take: 500 });
    for (const payment of paid) {
      if (!payment.subscription.esim || ['PENDING', 'RUNNING', 'FAILED'].includes((await this.db.provisioningJob.findUnique({ where: { esimId: payment.subscription.esim?.id ?? '' }, select: { state: true } }))?.state ?? 'PENDING')) {
        if (!payment.subscription.esim) flags.push({ kind: 'PAID_BUT_NOT_PROVISIONED', entityType: 'SUBSCRIPTION', entityId: payment.subscriptionId, detail: 'Verified payment has no eSIM record.' });
      }
    }
    const successfulRenewals = await this.db.renewalPayment.findMany({ where: { state: 'SUCCEEDED' }, include: { subscription: true }, take: 500 });
    for (const renewal of successfulRenewals) {
      const op = await this.db.providerOperation.findUnique({ where: { idempotencyKey: renewal.idempotencyKey }, select: { status: true } });
      if (op?.status !== 'SUCCEEDED') flags.push({ kind: 'RENEWAL_PAID_PACKAGE_NOT_ASSIGNED', entityType: 'SUBSCRIPTION', entityId: renewal.subscriptionId, detail: 'Verified renewal does not have a confirmed package assignment.' });
    }
    const esims = await this.db.esim.findMany({ where: { provider: this.provider.id }, include: { usage: { orderBy: { measuredAt: 'desc' }, take: 1 } }, take: 500 });
    for (const esim of esims) {
      if (esim.state === 'ACTIVE' && (!esim.usage[0] || Date.now() - esim.usage[0].measuredAt.getTime() > 24 * 60 * 60_000)) flags.push({ kind: 'USAGE_SYNC_STALE', entityType: 'ESIM', entityId: esim.id, detail: 'Usage snapshot is missing or older than 24 hours.' });
      if (esim.providerReference) {
        const status = await this.provider.getStatus(esim.providerReference);
        if (esim.state === 'ACTIVE' && status.status !== 'ACTIVE') flags.push({ kind: 'LOCAL_ACTIVE_PROVIDER_INACTIVE', entityType: 'ESIM', entityId: esim.id, detail: 'Local and provider activation states differ.' });
        if (status.status === 'ACTIVE' && esim.state !== 'ACTIVE') flags.push({ kind: 'PROVIDER_ACTIVE_LOCAL_PENDING', entityType: 'ESIM', entityId: esim.id, detail: 'Provider and local activation states differ.' });
      }
    }
    for (const flag of flags) await this.db.reconciliationIssue.upsert({ where: { fingerprint: `${flag.kind}:${flag.entityId}` }, create: { kind: flag.kind, entityType: flag.entityType, entityId: flag.entityId, safeDetails: flag.detail, fingerprint: `${flag.kind}:${flag.entityId}`, providerId: this.provider.id }, update: { safeDetails: flag.detail, status: 'OPEN', resolvedAt: null } });
    return flags.length;
  }
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
      const mapping = await tx.planProviderMapping.findFirst({ where: { planId, providerId: this.provider.id, active: true }, include: { product: true } });
      if (!mapping?.product.enabled) throw new AppError(409, 'PLAN_UNAVAILABLE', 'This plan is not available right now.');
      return tx.payment.create({ data: { checkoutKey, amountCents: plan.priceCents, currency: plan.currency, mode: this.billing.mode,
        subscription: { create: { userId, deviceId, planId, providerMappingId: mapping.id, providerIdSnapshot: mapping.providerId, providerProductIdSnapshot: mapping.product.providerProductId, providerMappingVersion: mapping.version } } }, include: { subscription: { include: { plan: true } } } });
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
    const result = await this.db.$transaction(async tx => {
      await lock(tx, `payment:${event.paymentId}`);
      if (await tx.webhookEvent.findUnique({ where: { id: event.id } })) return { duplicate: true };
      const payment = await tx.payment.findUnique({ where: { id: event.paymentId }, include: { subscription: true } });
      if (!payment) {
        const renewal = await tx.renewalPayment.findUnique({ where: { id: event.paymentId } });
        if (!renewal) throw new AppError(400, 'PAYMENT_UNKNOWN', 'Payment could not be verified.');
        if (!renewal.checkoutReference || renewal.mode !== this.billing.mode || renewal.checkoutReference !== event.reference || renewal.amountCents !== event.amountCents || renewal.currency !== event.currency) throw new AppError(400, 'PAYMENT_MISMATCH', 'Payment details do not match.');
        if (await tx.renewalWebhookEvent.findUnique({ where: { id: event.id } })) return { duplicate: true };
        await tx.renewalWebhookEvent.create({ data: { id: event.id, type: event.type, renewalPaymentId: renewal.id } });
        if (renewal.state !== 'SUCCEEDED') {
          if (event.outcome === 'failure') await tx.renewalPayment.update({ where: { id: renewal.id }, data: { state: 'FAILED' } });
          else {
            await tx.renewalPayment.update({ where: { id: renewal.id }, data: { state: 'SUCCEEDED' } });
            await tx.providerOperation.upsert({ where: { idempotencyKey: renewal.idempotencyKey }, create: { operationType: 'RENEWAL_PACKAGE', entityType: 'SUBSCRIPTION', entityId: renewal.subscriptionId, providerId: this.provider.id, idempotencyKey: renewal.idempotencyKey, status: 'PENDING' }, update: {} });
          }
        }
        return { duplicate: false, renewalId: renewal.id, outcome: event.outcome };
      }
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
    if ('renewalId' in result && result.outcome === 'success') await this.processRenewal(result.renewalId);
    return result;
  }
  async processRenewal(renewalId: string) {
    const renewal = await this.db.renewalPayment.findUnique({
      where: { id: renewalId },
      include: { subscription: { include: {
        esim: true, plan: true
      } } }
    });
    if (!renewal || renewal.state !== 'SUCCEEDED') return false;
    const opKey = renewal.idempotencyKey;
    const operation = await this.db.providerOperation.findUnique({ where: { idempotencyKey: opKey } });
    if (!operation || operation.status === 'SUCCEEDED' || operation.status === 'FAILED') return Boolean(operation?.status === 'SUCCEEDED');
    const esim = renewal.subscription.esim;
    const productId = renewal.subscription.providerProductIdSnapshot;
    if (!this.provider.capabilities.persistentEsim || !this.provider.capabilities.topUp || !esim?.providerReference || esim.state !== 'ACTIVE' || !productId) {
      await this.db.providerOperation.update({ where: { idempotencyKey: opKey }, data: { status: 'FAILED', safeErrorCode: 'CAPABILITY_OR_STATE_UNSUPPORTED', attempts: { increment: 1 } } });
      return false;
    }
    const claim = await this.db.providerOperation.updateMany({ where: { idempotencyKey: opKey, status: { in: ['PENDING', 'RETRYABLE_FAILURE'] } }, data: { status: 'RUNNING', attempts: { increment: 1 }, safeErrorCode: null } });
    if (claim.count !== 1) return false;
    try {
      const result = await this.provider.topUp({ reference: esim.providerReference, productId, idempotencyKey: opKey });
      if (!result.packageAssigned) throw new Error('Package assignment was not confirmed');
      await this.db.$transaction(async tx => {
        await tx.providerOperation.update({ where: { idempotencyKey: opKey }, data: { status: 'SUCCEEDED', providerReferenceId: result.reference, safeErrorCode: null } });
        await tx.subscription.update({ where: { id: renewal.subscriptionId }, data: { state: 'ACTIVE', periodStart: renewal.periodStart, periodEnd: renewal.periodEnd, expiresAt: renewal.periodEnd } });
      });
      return true;
    } catch {
      await this.db.providerOperation.update({ where: { idempotencyKey: opKey }, data: { status: 'RETRYABLE_FAILURE', safeErrorCode: 'PACKAGE_ASSIGNMENT_FAILED' } });
      return false;
    }
  }
  async runProvisioningOnce() {
    const leaseToken = randomUUID();
    const job = await this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "ProvisioningJob"
        WHERE ((state = 'PENDING' AND "availableAt" <= NOW()) OR (state = 'RUNNING' AND "leaseUntil" < NOW()))
        ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`);
      if (!rows[0]) return null;
      const claimed = await tx.provisioningJob.update({
        where: { id: rows[0].id },
        data: { state: 'RUNNING', leaseUntil: new Date(Date.now() + 60_000), leaseToken, attempts: { increment: 1 } },
        include: { esim: { include: { subscription: { include: {
          payment: true,
          plan: true
        } } } } }
      });
      await tx.esim.update({ where: { id: claimed.esimId }, data: { installationState: 'PROVISIONING' } });
      return claimed;
    });
    if (!job) return false;
    try {
      if (job.esim.subscription.payment?.state !== 'SUCCEEDED' || job.esim.provider !== this.provider.id) throw new Error('Provisioning precondition failed');
      const plan = job.esim.subscription.plan;
      const mappingId = job.esim.subscription.providerProductIdSnapshot;
      if (!mappingId || job.esim.subscription.providerIdSnapshot !== this.provider.id) throw new Error('Provider product mapping unavailable');
      await this.db.providerOperation.upsert({ where: { idempotencyKey: `provision:${job.esim.subscriptionId}` }, create: { operationType: 'PROVISION', entityType: 'ESIM', entityId: job.esimId, providerId: this.provider.id, idempotencyKey: `provision:${job.esim.subscriptionId}`, status: 'RUNNING', attempts: job.attempts }, update: { status: 'RUNNING', attempts: job.attempts, safeErrorCode: null } });
      const result = await this.provider.provision({ idempotencyKey: job.esim.subscriptionId, planId: plan.id, productId: mappingId, dataGb: plan.dataGb, durationDays: plan.durationDays });
      await this.db.providerOperation.upsert({ where: { idempotencyKey: `provision:${job.esim.subscriptionId}` }, create: { operationType: 'PROVISION', entityType: 'ESIM', entityId: job.esimId, providerId: this.provider.id, providerReferenceId: result.reference, idempotencyKey: `provision:${job.esim.subscriptionId}`, status: 'SUCCEEDED', attempts: job.attempts }, update: { providerReferenceId: result.reference, status: 'SUCCEEDED', attempts: job.attempts, safeErrorCode: null } });
      await this.db.$transaction(async tx => {
        const completed = await tx.provisioningJob.updateMany({ where: { id: job.id, state: 'RUNNING', leaseToken }, data: { state: 'COMPLETE', leaseUntil: null, leaseToken: null, lastError: null } });
        if (completed.count !== 1) return;
        await tx.esim.update({ where: { id: job.esimId }, data: { providerReference: result.reference, state: result.state, installationState: 'READY_TO_INSTALL', activationCipher: encrypt(result.install, this.config.ACTIVATION_ENCRYPTION_KEY, job.esimId) } });
      });
    } catch {
      await this.db.providerOperation.upsert({ where: { idempotencyKey: `provision:${job.esim.subscriptionId}` }, create: { operationType: 'PROVISION', entityType: 'ESIM', entityId: job.esimId, providerId: this.provider.id, idempotencyKey: `provision:${job.esim.subscriptionId}`, status: job.attempts >= 3 ? 'FAILED' : 'RETRYABLE_FAILURE', attempts: job.attempts, safeErrorCode: 'PROVIDER_OPERATION_FAILED' }, update: { status: job.attempts >= 3 ? 'FAILED' : 'RETRYABLE_FAILURE', attempts: job.attempts, safeErrorCode: 'PROVIDER_OPERATION_FAILED' } }).catch(() => undefined);
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
        if (result.status !== 'ACTIVE') throw new AppError(409, 'NOT_ACTIVE', 'Activation is still waiting for confirmation.');
        const periodStart = new Date();
        const periodEnd = new Date(periodStart.getTime() + esim.subscription.plan.durationDays * 86_400_000);
        await tx.subscription.update({ where: { id: esim.subscriptionId }, data: { state: 'ACTIVE', periodStart, periodEnd, expiresAt: periodEnd } });
      }
      return tx.esim.update({ where: { id }, data: { installationState: to, state: action === 'activate' ? 'ACTIVE' : action === 'confirm-install' ? 'INSTALLED' : 'READY' } });
    }, { timeout: 20_000 });
  }
}
