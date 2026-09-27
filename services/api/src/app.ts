import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { Prisma, type PrismaClient, type Esim, type User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { checkoutSchema, credentialsSchema, deviceSchema, idempotencySchema, idSchema, installationActionSchema, mockPaymentSchema, refreshSchema, registerSchema } from '@konekte/shared-validation';
import type { EsimProvider } from '@konekte/esim-provider-sdk';
import type { Config } from './config.js';
import { AppError, notFound } from './errors.js';
import { decrypt, hashPassword, hashToken, newRefreshToken, verifyPassword } from './crypto.js';
import { type BillingService, MockBillingService } from './billing.js';
import { lock, Workflows } from './workflows.js';
declare module '@fastify/jwt' { interface FastifyJWT { payload: { sub: string; sid: string }; user: { sub: string; sid: string } } }
export const publicEsim = (e: Esim) => ({ id: e.id, subscriptionId: e.subscriptionId, state: e.state, installationState: e.installationState, simulated: e.simulated, provider: e.provider });
const publicUser = (u: User) => ({ id: u.id, email: u.email, locale: u.locale });
export async function buildApp(deps: { db: PrismaClient; redis: Redis; provider: EsimProvider; billing: BillingService; config: Config; logger?: boolean }) {
  const { db, redis, provider, billing, config } = deps;
  const workflow = new Workflows(db, provider, billing, config);
  const app = Fastify({ logger: deps.logger ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body', 'res.body'] } : false, disableRequestLogging: true, bodyLimit: 64 * 1024, trustProxy: false });
  await app.register(cors, { origin: config.CORS_ORIGINS.split(',').map(s => s.trim()), methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'] });
  await app.register(helmet);
  await app.register(jwt, { secret: config.ACCESS_TOKEN_SECRET, sign: { expiresIn: '10m', iss: 'konekte-api', aud: 'konekte-app' }, verify: { allowedIss: 'konekte-api', allowedAud: 'konekte-app', algorithms: ['HS256'] } });
  await app.register(rateLimit, { redis, max: 120, timeWindow: '1 minute', skipOnError: false, nameSpace: `konekte:${config.NODE_ENV}:rate:`, errorResponseBuilder: () => ({ error: { code: 'RATE_LIMITED', message: 'Please wait a moment and try again.' } }) });
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.status(error.status).send({ error: { code: error.code, message: error.message, requestId: request.id } });
    if (error instanceof ZodError) return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: 'Check your details and try again.', requestId: request.id } });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply.status(409).send({ error: { code: 'CONFLICT', message: 'This request conflicts with an existing record.', requestId: request.id } });
    const status = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
    if (status >= 400 && status < 500) return reply.status(status).send({ error: { code: status === 429 ? 'RATE_LIMITED' : 'INVALID_REQUEST', message: status === 429 ? 'Please wait a moment and try again.' : 'The request could not be accepted.', requestId: request.id } });
    // Do not serialize arbitrary exceptions: provider/DB SDK errors can contain credentials.
    request.log.error({ code: 'INTERNAL_ERROR', requestId: request.id }, 'Request failed');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId: request.id } });
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'This page is not available.' } }));
  async function authenticate(request: FastifyRequest) {
    try { await request.jwtVerify(); }
    catch { throw new AppError(401, 'UNAUTHORIZED', 'Please sign in again.'); }
    const session = await db.session.findFirst({ where: { id: request.user.sid, userId: request.user.sub, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (!session) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in again.');
  }
  const protectedRoute = { preHandler: authenticate };
  const authRate = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  const dummyHash = await hashPassword(randomUUID());
  async function createSession(user: User) {
    const refreshToken = newRefreshToken();
    const session = await db.session.create({ data: { userId: user.id, familyId: randomUUID(), tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
    return { accessToken: app.jwt.sign({ sub: user.id, sid: session.id }), refreshToken, user: publicUser(user) };
  }
  app.get('/health', async () => ({ status: 'ok', service: 'konekte-api' }));
  app.get('/health/ready', async (_request, reply) => {
    try { await Promise.all([db.$queryRaw`SELECT 1`, redis.ping()]); return { status: 'ready' }; }
    catch { return reply.status(503).send({ status: 'unavailable' }); }
  });
  app.post('/api/v1/auth/register', authRate, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const user = await db.user.create({ data: { email: body.email, passwordHash: await hashPassword(body.password), locale: body.locale } });
    return reply.status(201).send(await createSession(user));
  });
  app.post('/api/v1/auth/login', authRate, async request => {
    const body = credentialsSchema.parse(request.body);
    const user = await db.user.findUnique({ where: { email: body.email } });
    const valid = await verifyPassword(body.password, user?.passwordHash ?? dummyHash);
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Check your email and password.');
    return createSession(user);
  });
  app.post('/api/v1/auth/refresh', authRate, async request => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const tokenHash = hashToken(refreshToken);
    const known = await db.session.findUnique({ where: { tokenHash } });
    if (!known) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in again.');
    const result = await db.$transaction(async tx => {
      await lock(tx, `session:${known.familyId}`);
      const current = await tx.session.findUniqueOrThrow({ where: { id: known.id }, include: { user: true } });
      if (current.revokedAt || current.expiresAt <= new Date()) {
        await tx.session.updateMany({ where: { familyId: known.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
        return null;
      }
      await tx.session.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
      const nextToken = newRefreshToken();
      const next = await tx.session.create({ data: { userId: current.userId, familyId: current.familyId, tokenHash: hashToken(nextToken), expiresAt: current.expiresAt } });
      return { accessToken: app.jwt.sign({ sub: current.userId, sid: next.id }), refreshToken: nextToken, user: publicUser(current.user) };
    });
    if (!result) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in again.');
    return result;
  });
  app.post('/api/v1/auth/logout', protectedRoute, async request => {
    const session = await db.session.findUniqueOrThrow({ where: { id: request.user.sid } });
    await db.$transaction(async tx => {
      await lock(tx, `session:${session.familyId}`);
      await tx.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { ok: true };
  });
  app.get('/api/v1/me', protectedRoute, async request => publicUser(await db.user.findUniqueOrThrow({ where: { id: request.user.sub } })));
  app.get('/api/v1/plans', async () => db.plan.findMany({ where: { enabled: true }, orderBy: { priceCents: 'asc' } }));
  app.get('/api/v1/devices', protectedRoute, async request => db.device.findMany({ where: { userId: request.user.sub }, orderBy: { createdAt: 'desc' }, take: 100 }));
  app.post('/api/v1/devices', protectedRoute, async (request, reply) => {
    const body = deviceSchema.parse(request.body);
    const device = await db.device.create({ data: { ...body, userId: request.user.sub, compatible: body.supportsEsim && body.unlocked } });
    return reply.status(201).send(device);
  });
  app.post('/api/v1/checkout', { ...protectedRoute, config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async request => {
    const body = checkoutSchema.parse(request.body);
    const key = idempotencySchema.parse(request.headers['idempotency-key']);
    return workflow.checkout(request.user.sub, body.planId, body.deviceId, key);
  });
  // Exists only in mock, nonproduction builds. Owner-scoped, no client-provided amount/status bypass.
  if (config.NODE_ENV !== 'production' && billing instanceof MockBillingService) {
    app.post('/api/v1/checkout/:id/simulate', protectedRoute, async request => {
      const id = idSchema.parse((request.params as { id: string }).id);
      const { outcome } = mockPaymentSchema.parse(request.body);
      const payment = await db.payment.findFirst({ where: { id, mode: 'mock', subscription: { userId: request.user.sub } }, include: { subscription: { include: { plan: true } } } });
      if (!payment) notFound();
      const signed = billing.signedEvent({ paymentId: id, amountCents: payment.amountCents, currency: payment.currency, planName: payment.subscription.plan.name }, outcome);
      const event = billing.verifyEvent(Buffer.from(signed.body), signed.signature);
      if (!event) throw new AppError(400, 'INVALID_EVENT', 'Payment verification failed.');
      await workflow.acceptPayment(event);
      return { ok: true };
    });
  }
  app.get('/api/v1/subscriptions', protectedRoute, async request => {
    const subscriptions = await db.subscription.findMany({ where: { userId: request.user.sub }, include: { plan: true, payment: true, esim: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return subscriptions.map(s => ({ id: s.id, state: s.state, plan: s.plan, payment: s.payment ? { id: s.payment.id, state: s.payment.state, mode: s.payment.mode, checkoutUrl: s.payment.checkoutUrl } : null, esim: s.esim ? publicEsim(s.esim) : null }));
  });
  app.get('/api/v1/esims/capabilities', protectedRoute, async () => provider.capabilities);
  app.get('/api/v1/esims', protectedRoute, async request => (await db.esim.findMany({ where: { subscription: { userId: request.user.sub } }, take: 100 })).map(publicEsim));
  app.get('/api/v1/esims/:id/installation', protectedRoute, async request => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const esim = await db.esim.findFirst({ where: { id, subscription: { userId: request.user.sub } } });
    if (!esim) notFound();
    if (!esim.activationCipher || !['READY', 'INSTALLED', 'ACTIVE'].includes(esim.state)) throw new AppError(409, 'NOT_READY', 'Your setup is still being prepared.');
    return decrypt(esim.activationCipher, config.ACTIVATION_ENCRYPTION_KEY, esim.id);
  });
  app.post('/api/v1/esims/:id/installation', protectedRoute, async request => {
    const id = idSchema.parse((request.params as { id: string }).id);
    return publicEsim(await workflow.installationAction(request.user.sub, id, installationActionSchema.parse(request.body).action));
  });
  app.post('/api/v1/esims/:id/retry', protectedRoute, async request => {
    const id = idSchema.parse((request.params as { id: string }).id);
    const esim = await db.esim.findFirst({ where: { id, subscription: { userId: request.user.sub, payment: { state: 'SUCCEEDED' } } } });
    if (!esim) notFound();
    await db.provisioningJob.updateMany({ where: { esimId: id, state: 'FAILED' }, data: { state: 'PENDING', attempts: 0, availableAt: new Date() } });
    return { ok: true };
  });
  app.get('/api/v1/usage', protectedRoute, async request => {
    const query = z.object({ esimId: idSchema.optional() }).strict().parse(request.query);
    const esims = await db.esim.findMany({ where: { id: query.esimId, subscription: { userId: request.user.sub } }, include: { subscription: { include: { plan: true } } }, take: 100 });
    if (query.esimId && !esims.length) notFound();
    const result = [];
    for (const esim of esims) {
      if (!esim.providerReference || esim.provider !== provider.id || !['ACTIVE', 'EXPIRED'].includes(esim.state)) continue;
      let snapshot = await db.usage.findFirst({ where: { esimId: esim.id }, orderBy: { measuredAt: 'desc' } });
      if (esim.state === 'ACTIVE' && (!snapshot || Date.now() - snapshot.measuredAt.getTime() > 60_000)) {
        let usage;
        try { usage = await provider.usage(esim.providerReference); }
        catch { throw new AppError(502, 'USAGE_UNAVAILABLE', 'Usage is unavailable. Please try again.'); }
        if (!Number.isSafeInteger(usage.usedBytes) || usage.usedBytes < 0) throw new AppError(502, 'USAGE_UNAVAILABLE', 'Usage is unavailable.');
        snapshot = await db.usage.create({ data: { esimId: esim.id, usedBytes: BigInt(usage.usedBytes), totalBytes: BigInt(esim.subscription.plan.dataGb) * 1_000_000_000n, measuredAt: usage.measuredAt, simulated: esim.simulated } });
      }
      if (snapshot) result.push({ esimId: esim.id, usedBytes: Number(snapshot.usedBytes), totalBytes: Number(snapshot.totalBytes), measuredAt: snapshot.measuredAt.toISOString(), simulated: snapshot.simulated });
    }
    return result;
  });
  await app.register(async webhook => {
    webhook.removeContentTypeParser('application/json');
    webhook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    webhook.post('/api/v1/webhooks/stripe', async request => {
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string' || !Buffer.isBuffer(request.body)) throw new AppError(400, 'INVALID_SIGNATURE', 'Payment verification failed.');
      const event = billing.verifyEvent(request.body, signature);
      if (event) await workflow.acceptPayment(event);
      return { received: true };
    });
  });
  return { app, workflow };
}
