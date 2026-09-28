import { z } from 'zod';
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(48), ACTIVATION_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  ESIM_PROVIDER: z.string().default('mock'),
  ESIM_PROVIDER_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  ESIM_API_BASE_URL: z.string().url().optional(), ESIM_API_KEY_REF: z.string().optional(), ESIM_WEBHOOK_SECRET_REF: z.string().optional(),
  ESIM_ACCOUNT_CUSTOMER_ID: z.string().optional(), ESIM_TIMEOUT_MS: z.coerce.number().int().min(100).max(120000).default(10000),
  ESIM_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3), ESIM_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).max(60000).default(250),
  ESIM_RETRY_MAX_DELAY_MS: z.coerce.number().int().min(0).max(300000).default(5000), ESIM_ENABLED_COUNTRIES: z.string().default('HT'),
  ESIM_ENVIRONMENT: z.enum(['SANDBOX', 'PRODUCTION']).default('SANDBOX'), ESIM_CAPABILITY_OVERRIDES: z.string().optional(), BILLING_MODE: z.enum(['mock', 'stripe_test']).default('mock'),
  STRIPE_SECRET_KEY: z.string().optional(), STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CHECKOUT_RETURN_URL: z.string().url().default('http://localhost:5173/checkout-return'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081')
});
export type Config = z.infer<typeof configSchema>;
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  const c = parsed.data;
  if (c.NODE_ENV === 'production') throw new Error('Production disabled: real eSIM adapter and approved pricing are required.');
  if (c.ESIM_PROVIDER_ENABLED && c.ESIM_PROVIDER !== 'mock' && (!c.ESIM_API_BASE_URL || !c.ESIM_API_KEY_REF || !c.ESIM_WEBHOOK_SECRET_REF)) throw new Error('Enabled eSIM provider configuration is incomplete.');
  for (const ref of [c.ESIM_API_KEY_REF, c.ESIM_WEBHOOK_SECRET_REF]) if (ref && !/^(?:[A-Z][A-Z0-9_]*|secret:\/\/[A-Za-z0-9_./-]+)$/.test(ref)) throw new Error('Provider credentials must be secret references.');
  if (c.ESIM_CAPABILITY_OVERRIDES) { try { JSON.parse(c.ESIM_CAPABILITY_OVERRIDES); } catch { throw new Error('Invalid provider capability overrides.'); } }
  if (c.STRIPE_SECRET_KEY && !c.STRIPE_SECRET_KEY.startsWith('sk_test_')) throw new Error('Only Stripe test credentials are supported.');
  if (c.BILLING_MODE === 'stripe_test' && (!c.STRIPE_SECRET_KEY || !c.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))) throw new Error('Stripe test configuration incomplete.');
  return c;
}
