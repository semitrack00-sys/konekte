import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ZesimoReadOnlyProvider } from '@konekte/esim-provider-sdk';

/** Separate diagnostic host: never mounts customer, payment, or mutation routes. */
export async function buildIntegrationApp(env: NodeJS.ProcessEnv, transport?: typeof fetch) {
  const token = env.KONEKTE_DIAGNOSTIC_TOKEN;
  if (!token || token.length < 32 || /\s/.test(token)) throw new Error('KONEKTE_DIAGNOSTIC_TOKEN is required.');
  const expected = createHash('sha256').update(`Bearer ${token}`).digest();
  const app = Fastify({ logger: false, bodyLimit: 1024, requestTimeout: 15000 });
  await app.register(helmet);
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((_error, _request, reply) => { reply.code(503).send({ error: 'REQUEST_UNAVAILABLE' }); });
  app.get('/health', async () => ({ status: 'ok', service: 'konekte-integration', purchasesEnabled: false }));
  let lastAttempt = 0;
  let busy = false;
  app.get('/internal/zesimo/:check', async (request, reply) => {
    const operation = (request.params as { check: string }).check;
    if (operation !== 'check' && operation !== 'haiti') return reply.code(404).send({ error: 'NOT_FOUND' });
    const received = createHash('sha256').update(request.headers.authorization ?? '').digest();
    if (!timingSafeEqual(expected, received)) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!env.ZESIMO_API_KEY) return reply.code(503).send({ error: 'ZESIMO_KEY_NOT_CONFIGURED' });
    if (busy || Date.now() - lastAttempt < 60_000) return reply.code(429).send({ error: 'CHECK_RATE_LIMITED' });
    busy = true;
    lastAttempt = Date.now();
    try {
      const provider = new ZesimoReadOnlyProvider({ token: env.ZESIMO_API_KEY, fetch: transport });
      await provider.checkAuthentication();
      if (operation === 'haiti') {
        const products = await provider.listProducts('HT');
        return { authenticated: true, countryCode: 'HT', supportedPackageCount: products.length,
          packages: products.map(({ id, dataGb, durationDays }) => ({ id, dataGb, durationDays })),
          pricingExposed: false, coverageQualified: false, purchasesEnabled: false, voiceEnabled: false };
      }
      return { authenticated: true, purchasesEnabled: false };
    } catch {
      return reply.code(503).send({ error: 'ZESIMO_CHECK_FAILED' });
    } finally { busy = false; }
  });
  return app;
}
