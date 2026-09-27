import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) throw new Error('.env already exists; refusing to overwrite local configuration.');
const password = randomBytes(24).toString('hex');
const lines = {
  NODE_ENV: 'development', PORT: '4000', POSTGRES_USER: 'konekte', POSTGRES_PASSWORD: password,
  DATABASE_URL: `postgresql://konekte:${password}@localhost:55432/konekte`,
  TEST_DATABASE_URL: `postgresql://konekte:${password}@localhost:55433/konekte_test`,
  REDIS_URL: 'redis://localhost:56379', ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'),
  ACTIVATION_ENCRYPTION_KEY: randomBytes(32).toString('hex'), ESIM_PROVIDER: 'mock', BILLING_MODE: 'mock',
  CHECKOUT_RETURN_URL: 'http://localhost:5173/checkout-return',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:8081',
  EXPO_PUBLIC_API_URL: 'http://localhost:4000', VITE_API_URL: 'http://localhost:4000'
};
writeFileSync('.env', Object.entries(lines).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', {mode: 0o600});
console.log('Created ignored .env with random development-only secrets.');
