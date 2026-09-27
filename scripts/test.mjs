import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
config({ quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/konekte_test') throw new Error('TEST_DATABASE_URL must name the dedicated konekte_test database.');
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: url, BILLING_MODE: 'mock', ESIM_PROVIDER: 'mock' };
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'services/api/prisma/schema.prisma'],
  ['node_modules/vitest/vitest.mjs', 'run']
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
