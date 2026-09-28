import type { ProviderCapabilities, ProviderCoverage, ProviderProduct, Usage } from '@konekte/shared-types';

export interface ProvisionRequest { idempotencyKey: string; planId?: string; planCode?: string; productId?: string; dataGb: number; durationDays: number }
export interface ProvisionResult { reference: string; state: 'READY'; install: { simulated: boolean; qrPayload: string; manual: { address: string; code: string }; instructions: string } }
export interface ProviderResult { reference: string; status: string; packageAssigned?: boolean }
export interface ProviderWebhookEvent { eventId: string; type: string; reference?: string }
export interface ProviderWebhookVerifier { verify(rawBody: Buffer, signature: string): ProviderWebhookEvent | null }

export interface EsimProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  checkAuthentication(): Promise<void>;
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

export type ProviderAdapterErrorCode = 'NOT_CONFIGURED' | 'UNSUPPORTED' | 'UNAVAILABLE';
export class ProviderAdapterError extends Error {
  constructor(readonly code: ProviderAdapterErrorCode, operation: string) {
    super(`Provider operation ${operation} is ${code.toLowerCase().replaceAll('_', ' ')}.`);
    this.name = 'ProviderAdapterError';
  }
}

export interface ProviderAdapterConfiguration {
  providerName: string;
  apiBaseUrl?: string;
  apiKeyReference?: string;
  webhookSecretReference?: string;
  accountCustomerId?: string;
  timeoutMs: number;
  retryPolicy: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
  enabledCountries: string[];
  environment: 'SANDBOX' | 'PRODUCTION';
  capabilityOverrides: Partial<ProviderCapabilities>;
  enabled: boolean;
}

export interface CatalogProductInput {
  providerProductId: string;
  countryCode: string;
  name: string;
  dataGb: number;
  durationDays: number;
  wholesalePriceCents: number | null;
  currency: string;
  networkMetadata: Record<string, unknown> | null;
  capabilityMetadata: Partial<ProviderCapabilities> | null;
}
