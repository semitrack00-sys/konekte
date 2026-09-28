import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderCapabilities, ProviderCoverage, ProviderProduct, Usage } from '@konekte/shared-types';

export interface ProvisionRequest { idempotencyKey: string; planId?: string; planCode?: string; productId?: string; dataGb: number; durationDays: number }
export interface ProvisionResult { reference: string; state: 'READY'; install: { simulated: true; qrPayload: string; manual: { address: string; code: string }; instructions: string } }
export interface ProviderResult { reference: string; status: string; packageAssigned?: boolean }
export interface ProviderWebhookEvent { eventId: string; type: string; reference?: string }
export interface ProviderWebhookVerifier { verify(rawBody: Buffer, signature: string): ProviderWebhookEvent | null }

/** Vendor-neutral boundary. Product IDs are passed only between server components. */
export interface EsimProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  getCoverage(countryCode: string): Promise<ProviderCoverage>;
  listProducts(countryCode: string): Promise<ProviderProduct[]>;
  provision(input: ProvisionRequest): Promise<ProvisionResult>;
  getStatus(reference: string): Promise<ProviderResult>;
  activate(reference: string): Promise<ProviderResult>;
  topUp(input: { reference: string; productId: string; idempotencyKey: string }): Promise<ProviderResult>;
  getUsage(reference: string): Promise<Usage>;
  suspend(reference: string): Promise<ProviderResult>;
  resume(reference: string): Promise<ProviderResult>;
  terminate(reference: string): Promise<ProviderResult>;
  reconcileByIdempotencyKey(key: string): Promise<ProviderResult | null>;
}

export class MockEsimProvider implements EsimProvider {
  readonly id = 'mock';
  readonly capabilities: ProviderCapabilities = { persistentEsim: true, topUp: true, autoRenew: false, usageReporting: true, qrInstall: true, manualInstall: true, activation: true, hotspot: false, voice: false, sms: false, phoneNumber: false, simulated: true };
  private readonly refs = new Map<string, ProviderResult>();
  private readonly operations = new Map<string, ProviderResult>();
  async getCoverage(countryCode: string): Promise<ProviderCoverage> { return { countryCode, available: countryCode.toUpperCase() === 'HT', simulated: true }; }
  async listProducts(countryCode: string): Promise<ProviderProduct[]> {
    if (countryCode.toUpperCase() !== 'HT') return [];
    return [{ id: 'mock-basic-10gb', countryCode: 'HT', name: 'Mock 10 GB package', dataGb: 10, durationDays: 30, priceCents: 0, currency: 'usd', simulated: true }, { id: 'mock-plus-30gb', countryCode: 'HT', name: 'Mock 30 GB package', dataGb: 30, durationDays: 30, priceCents: 0, currency: 'usd', simulated: true }, { id: 'mock-max-50gb', countryCode: 'HT', name: 'Mock 50 GB package', dataGb: 50, durationDays: 30, priceCents: 0, currency: 'usd', simulated: true }];
  }
  async provision(input: ProvisionRequest): Promise<ProvisionResult> {
    const prior = this.operations.get(input.idempotencyKey);
    if (prior) return { reference: prior.reference, state: 'READY', install: { simulated: true, qrPayload: 'MOCK-NOT-INSTALLABLE', manual: { address: 'mock.invalid', code: 'MOCK-NOT-INSTALLABLE' }, instructions: 'Simulated setup only.' } };
    const reference = `mock-${input.idempotencyKey}`;
    const result = { reference, status: 'READY' };
    this.refs.set(reference, result); this.operations.set(input.idempotencyKey, result);
    return { reference, state: 'READY', install: { simulated: true, qrPayload: 'MOCK-NOT-INSTALLABLE', manual: { address: 'mock.invalid', code: 'MOCK-NOT-INSTALLABLE' }, instructions: 'Simulated setup only.' } };
  }
  async getStatus(reference: string) { return this.refs.get(reference) ?? { reference, status: 'UNKNOWN' }; }
  async activate(reference: string) { const prior = await this.getStatus(reference); if (['TERMINATED', 'EXPIRED', 'SUSPENDED'].includes(prior.status)) throw new Error('Mock eSIM state does not allow activation'); const result = { reference, status: 'ACTIVE' }; this.refs.set(reference, result); return result; }
  async topUp(input: { reference: string; productId: string; idempotencyKey: string }) { const prior = this.operations.get(input.idempotencyKey); if (prior) return prior; const result = { reference: input.reference, status: 'ACTIVE', packageAssigned: true }; this.operations.set(input.idempotencyKey, result); return result; }
  async getUsage(reference: string): Promise<Usage> { return { esimId: reference, usedBytes: 256_000_000, totalBytes: 0, measuredAt: new Date().toISOString(), simulated: true }; }
  async usage(reference: string) { return this.getUsage(reference); }
  async suspend(reference: string) { const prior = await this.getStatus(reference); if (prior.status !== 'ACTIVE' && prior.status !== 'SUSPENDED') throw new Error('Mock eSIM state does not allow suspension'); const result = { reference, status: 'SUSPENDED' }; this.refs.set(reference, result); return result; }
  async resume(reference: string) { const prior = await this.getStatus(reference); if (prior.status === 'ACTIVE') return prior; if (prior.status !== 'SUSPENDED') throw new Error('Mock eSIM state does not allow resumption'); const result = { reference, status: 'ACTIVE' }; this.refs.set(reference, result); return result; }
  async terminate(reference: string) { const prior = await this.getStatus(reference); if (prior.status === 'TERMINATED') return prior; if (prior.status === 'UNKNOWN') throw new Error('Cannot terminate an unknown mock eSIM'); const result = { reference, status: 'TERMINATED' }; this.refs.set(reference, result); return result; }
  async reconcileByIdempotencyKey(key: string) { return this.operations.get(key) ?? null; }
}

export class MockProviderWebhookVerifier implements ProviderWebhookVerifier {
  constructor(private readonly key: string) {}
  sign(rawBody: Buffer) { return createHmac('sha256', this.key).update(rawBody).digest('hex'); }
  verify(rawBody: Buffer, signature: string): ProviderWebhookEvent | null {
    const expected = Buffer.from(this.sign(rawBody)); const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    try { const value = JSON.parse(rawBody.toString('utf8')) as ProviderWebhookEvent; return typeof value.eventId === 'string' && typeof value.type === 'string' ? value : null; } catch { return null; }
  }
}

export function createEsimProvider(provider: string, environment: string): EsimProvider {
  if (environment === 'production' && provider === 'mock') throw new Error('A real eSIM provider must be configured for production.');
  if (provider !== 'mock') throw new Error('Provider adapter is not configured.');
  return new MockEsimProvider();
}
