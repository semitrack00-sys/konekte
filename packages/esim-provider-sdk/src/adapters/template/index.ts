import type { ProviderCapabilities } from '@konekte/shared-types';
import type { EsimProvider, ProviderAdapterConfiguration, ProviderResult, ProvisionRequest, ProvisionResult } from '../../contracts/index.js';
import { ProviderAdapterError } from '../../contracts/index.js';

const disabledCapabilities: ProviderCapabilities = {
  persistentEsim: false, topUp: false, autoRenew: false, usageReporting: false,
  qrInstall: false, manualInstall: false, activation: false, hotspot: false,
  voice: false, sms: false, phoneNumber: false, suspend: false, resume: false,
  terminate: false, reconciliation: false, simulated: false
};

/** Skeleton only. It intentionally has no HTTP client and never falls back to mock. */
export class TemplateEsimProvider implements EsimProvider {
  readonly id = 'template';
  readonly capabilities: ProviderCapabilities;
  constructor(readonly configuration?: ProviderAdapterConfiguration) {
    this.capabilities = { ...disabledCapabilities, ...(configuration?.capabilityOverrides ?? {}), simulated: false };
  }
  private reject(operation: string, supported = true): never {
    throw new ProviderAdapterError(supported ? 'NOT_CONFIGURED' : 'UNSUPPORTED', operation);
  }
  async checkAuthentication(): Promise<void> { this.reject('authentication'); }
  async getCoverage(_countryCode: string) { return this.reject('coverage'); }
  async listProducts(_countryCode: string) { return this.reject('catalog'); }
  async provision(_input: ProvisionRequest): Promise<ProvisionResult> { return this.reject('provision', this.capabilities.activation); }
  async getStatus(_reference: string): Promise<ProviderResult> { return this.reject('status'); }
  async activate(_reference: string): Promise<ProviderResult> { return this.reject('activation', this.capabilities.activation); }
  async topUp(_input: { reference: string; productId: string; idempotencyKey: string }): Promise<ProviderResult> { return this.reject('top-up', this.capabilities.topUp); }
  async getUsage(_reference: string) { return this.reject('usage', this.capabilities.usageReporting); }
  async suspend(_reference: string): Promise<ProviderResult> { return this.reject('suspend', this.capabilities.suspend); }
  async resume(_reference: string): Promise<ProviderResult> { return this.reject('resume', this.capabilities.resume); }
  async terminate(_reference: string): Promise<ProviderResult> { return this.reject('terminate', this.capabilities.terminate); }
  async reconcileByIdempotencyKey(_key: string): Promise<ProviderResult | null> { return this.reject('reconciliation', this.capabilities.reconciliation); }
}
