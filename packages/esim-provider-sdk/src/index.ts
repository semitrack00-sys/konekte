import type { EsimState, InstallData, ProviderCapabilities } from '@konekte/shared-types';
export interface ProvisionRequest { idempotencyKey: string; planCode: string; dataGb: number; durationDays: number }
export interface ProvisionResult { reference: string; state: 'READY'; install: InstallData }
/** Adapters must guarantee durable idempotency and expose reconciliation by the same key. */
export interface EsimProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  provision(request: ProvisionRequest): Promise<ProvisionResult>;
  activate(reference: string): Promise<{ state: EsimState }>;
  usage(reference: string): Promise<{ usedBytes: number; measuredAt: Date }>;
}
export class MockEsimProvider implements EsimProvider {
  readonly id = 'mock';
  readonly capabilities: ProviderCapabilities = { data: true, qrInstall: true, manualInstall: true, usage: true, activation: true, voice: false, sms: false, simulated: true };
  async provision(request: ProvisionRequest): Promise<ProvisionResult> {
    // Deterministic across processes/restarts. Deliberately not an LPA activation payload.
    return { reference: `mock-${request.idempotencyKey}`, state: 'READY', install: {
      simulated: true, qrPayload: `KONEKTE-DEMO-NOT-INSTALLABLE:${request.idempotencyKey}`,
      manual: { address: 'mock.invalid', code: `DEMO-${request.idempotencyKey}` },
      instructions: 'Practice setup only. This cannot install an eSIM or connect to the internet.'
    } };
  }
  async activate(_reference: string): Promise<{ state: EsimState }> { return { state: 'ACTIVE' }; }
  async usage(_reference: string) { return { usedBytes: 256_000_000, measuredAt: new Date() }; }
}
export function createEsimProvider(name: string, environment: string): EsimProvider {
  if (environment === 'production') throw new Error('Production disabled: an audited real eSIM adapter is required.');
  if (name !== 'mock') throw new Error('Unknown eSIM adapter; refusing fallback.');
  return new MockEsimProvider();
}
