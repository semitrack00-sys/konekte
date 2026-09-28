import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createEsimProvider, MockEsimProvider } from '@konekte/esim-provider-sdk';
import { decrypt, encrypt, hashPassword, verifyPassword } from '../src/crypto.js';
import { readConfig } from '../src/config.js';
const environment = () => ({ NODE_ENV: 'test', DATABASE_URL: process.env.DATABASE_URL, REDIS_URL: process.env.REDIS_URL, ACCESS_TOKEN_SECRET: randomBytes(48).toString('hex'), ACTIVATION_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
describe('security boundaries', () => {
  it('hashes passwords with unique salts and verifies them', async () => {
    const password = randomBytes(24).toString('hex');
    const a = await hashPassword(password); const b = await hashPassword(password);
    expect(a).not.toEqual(b); expect(a).not.toContain(password);
    expect(await verifyPassword(password, a)).toBe(true); expect(await verifyPassword('wrong-password', a)).toBe(false);
  });
  it('encrypts activation data and binds it to the owning eSIM', () => {
    const key = randomBytes(32).toString('hex');
    const value = { code: 'demo-not-installable' }; const cipher = encrypt(value, key, 'esim-a');
    expect(cipher).not.toContain(value.code); expect(decrypt(cipher, key, 'esim-a')).toEqual(value);
    expect(() => decrypt(cipher, key, 'esim-b')).toThrow();
    expect(() => decrypt(cipher, randomBytes(32).toString('hex'), 'esim-a')).toThrow();
  });
  it('fails closed in production even if a provider name is supplied', () => {
    expect(() => readConfig({ ...environment(), NODE_ENV: 'production', ESIM_PROVIDER: 'future-provider' })).toThrow('Production disabled');
    expect(() => createEsimProvider('mock', 'production')).toThrow();
  });
  it('rejects unknown providers instead of silently falling back', () => { expect(() => createEsimProvider('unknown', 'test')).toThrow(); });
  it('rejects Stripe live mode credentials', () => { expect(() => readConfig({ ...environment(), STRIPE_SECRET_KEY: ['sk', 'live', 'rejected'].join('_') })).toThrow('Only Stripe test'); });
  it('allows mock billing without Stripe credentials', () => { expect(readConfig(environment()).BILLING_MODE).toBe('mock'); });
  it('accepts only secret references and rejects provider credential values', () => {
    expect(readConfig({ ...environment(), ESIM_API_KEY_REF: 'PROVIDER_API_KEY', ESIM_WEBHOOK_SECRET_REF: 'secret://konekte/provider/webhook' }).ESIM_API_KEY_REF).toBe('PROVIDER_API_KEY');
    expect(() => readConfig({ ...environment(), ESIM_API_KEY_REF: 'sk_live_sensitive-provider-secret' })).toThrow('secret references');
    expect(() => readConfig({ ...environment(), ESIM_PROVIDER: 'template', ESIM_PROVIDER_ENABLED: 'true' })).toThrow('incomplete');
  });
  it('requires a complete Stripe test configuration', () => { expect(() => readConfig({ ...environment(), BILLING_MODE: 'stripe_test' })).toThrow('incomplete'); });
  it('returns deterministic, noninstallable mock data across adapter instances', async () => {
    const request = { idempotencyKey: 'a-test-request', planCode: 'basic', dataGb: 10, durationDays: 30 };
    const a = await new MockEsimProvider().provision(request); const b = await new MockEsimProvider().provision(request);
    expect(a).toEqual(b); expect(a.install.simulated).toBe(true); expect(a.install.qrPayload).not.toMatch(/^LPA:/);
    expect(a.install.manual.address).toBe('mock.invalid');
    expect(new MockEsimProvider().capabilities).toMatchObject({ voice: false, sms: false, simulated: true });
  });
});
