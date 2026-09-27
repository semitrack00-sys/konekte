import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createEsimProvider } from '@konekte/esim-provider-sdk';
import { readConfig } from './config.js';
import { createBilling } from './billing.js';
export function createRuntime() {
  dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
  const config = readConfig(process.env);
  const provider = createEsimProvider(config.ESIM_PROVIDER, config.NODE_ENV);
  const billing = createBilling(config);
  const db = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
  redis.on('error', () => { /* Readiness and request errors expose availability, never credentials. */ });
  return { db, redis, config, provider, billing };
}
