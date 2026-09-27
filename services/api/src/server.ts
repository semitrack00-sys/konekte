import { buildApp } from './app.js';
import { createRuntime } from './runtime.js';
const runtime = createRuntime();
const { app } = await buildApp({ ...runtime, logger: true });
async function shutdown() {
  await app.close();
  await runtime.db.$disconnect();
  runtime.redis.disconnect();
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
try { await app.listen({ port: runtime.config.PORT, host: '127.0.0.1' }); }
catch { app.log.error({ code: 'STARTUP_FAILED' }, 'API startup failed'); await shutdown(); process.exitCode = 1; }
