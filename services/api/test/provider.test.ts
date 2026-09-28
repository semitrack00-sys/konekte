import { describe, expect, it } from 'vitest';
import { MockEsimProvider, MockProviderWebhookVerifier } from '@konekte/esim-provider-sdk';
import { randomBytes } from 'node:crypto';

describe('vendor-neutral simulated provider contract', () => {
  it('reports explicitly simulated coverage and product catalog', async () => {
    const provider = new MockEsimProvider();
    expect(await provider.getCoverage('HT')).toEqual({ countryCode: 'HT', available: true, simulated: true });
    expect(await provider.listProducts('HT')).toHaveLength(3);
    expect((await provider.listProducts('HT')).every(product => product.simulated && !product.name.toLowerCase().includes('carrier'))).toBe(true);
  });
  it('preserves the same eSIM reference and assigns a top-up once per idempotency key', async () => {
    const provider = new MockEsimProvider();
    const esim = await provider.provision({ idempotencyKey: 'subscription-1', planId: 'basic', productId: 'mock-basic-10gb', dataGb: 10, durationDays: 30 });
    const first = await provider.topUp({ reference: esim.reference, productId: 'mock-basic-10gb', idempotencyKey: 'renewal-1' });
    const second = await provider.topUp({ reference: esim.reference, productId: 'mock-basic-10gb', idempotencyKey: 'renewal-1' });
    expect(second).toEqual(first); expect(second.reference).toBe(esim.reference); expect(second.packageAssigned).toBe(true);
  });
  it('supports safe suspend and resume transitions with termination terminal in the mock', async () => {
    const provider = new MockEsimProvider();
    const esim = await provider.provision({ idempotencyKey: 'subscription-2', planId: 'basic', productId: 'mock-basic-10gb', dataGb: 10, durationDays: 30 });
    await provider.activate(esim.reference);
    expect((await provider.suspend(esim.reference)).status).toBe('SUSPENDED');
    expect((await provider.resume(esim.reference)).status).toBe('ACTIVE');
    expect((await provider.terminate(esim.reference)).status).toBe('TERMINATED');
    await expect(provider.resume(esim.reference)).rejects.toThrow();
    await expect(provider.activate(esim.reference)).rejects.toThrow();
  });
  it('declares persistent top-up while gating unsupported auto-renew and phone services', async () => {
    const provider = new MockEsimProvider();
    expect(provider.capabilities).toMatchObject({ persistentEsim: true, topUp: true, autoRenew: false, voice: false, sms: false, phoneNumber: false, simulated: true });
  });
  it('verifies signatures over raw webhook bytes without imposing vendor formats', () => {
    const verifier = new MockProviderWebhookVerifier(randomBytes(32).toString('hex'));
    const raw = Buffer.from(JSON.stringify({ eventId: 'mock-event', type: 'provider.event' }));
    expect(verifier.verify(raw, verifier.sign(raw))).toMatchObject({ eventId: 'mock-event', type: 'provider.event' });
    expect(verifier.verify(raw, 'invalid')).toBeNull();
  });
});
