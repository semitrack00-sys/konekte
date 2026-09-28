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
  const capabilityOverrides = config.ESIM_CAPABILITY_OVERRIDES ? JSON.parse(config.ESIM_CAPABILITY_OVERRIDES) : {};
  const provider = createEsimProvider(config.ESIM_PROVIDER, config.NODE_ENV, {
    providerName: config.ESIM_PROVIDER, apiBaseUrl: config.ESIM_API_BASE_URL,
    apiKeyReference: config.ESIM_API_KEY_REF, webhookSecretReference: config.ESIM_WEBHOOK_SECRET_REF,
    accountCustomerId: config.ESIM_ACCOUNT_CUSTOMER_ID, timeoutMs: config.ESIM_TIMEOUT_MS,
    retryPolicy: { maxAttempts: config.ESIM_RETRY_MAX_ATTEMPTS, baseDelayMs: config.ESIM_RETRY_BASE_DELAY_MS, maxDelayMs: config.ESIM_RETRY_MAX_DELAY_MS },
    enabledCountries: config.ESIM_ENABLED_COUNTRIES.split(',').map(value => value.trim().toUpperCase()).filter(Boolean),
    environment: config.ESIM_ENVIRONMENT, capabilityOverrides, enabled: config.ESIM_PROVIDER_ENABLED
  });
  const billing = createBilling(config);
  const db = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
  redis.on('error', () => { /* Readiness and request errors expose availability, never credentials. */ });
  return { db, redis, config, provider, billing };
}
