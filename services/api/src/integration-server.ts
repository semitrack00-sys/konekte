import { buildIntegrationApp } from './integration-app.js';

try {
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const app = await buildIntegrationApp(process.env);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => { void app.close(); });
  }
  await app.listen({ port, host: '0.0.0.0' });
} catch {
  console.error('KONEKTE_INTEGRATION_STARTUP_FAILED');
  process.exitCode = 1;
}
