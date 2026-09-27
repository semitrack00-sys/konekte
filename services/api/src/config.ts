import { z } from 'zod';
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(48), ACTIVATION_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  ESIM_PROVIDER: z.string().default('mock'), BILLING_MODE: z.enum(['mock', 'stripe_test']).default('mock'),
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
  if (c.STRIPE_SECRET_KEY && !c.STRIPE_SECRET_KEY.startsWith('sk_test_')) throw new Error('Only Stripe test credentials are supported.');
  if (c.BILLING_MODE === 'stripe_test' && (!c.STRIPE_SECRET_KEY || !c.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))) throw new Error('Stripe test configuration incomplete.');
  return c;
}
