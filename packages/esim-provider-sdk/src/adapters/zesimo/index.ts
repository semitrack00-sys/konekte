import type { ProviderCapabilities, ProviderProduct, Usage } from '@konekte/shared-types';
import { ProviderAdapterError, type EsimProvider, type ProviderResult, type ProvisionRequest, type ProvisionResult } from '../../contracts/index.js';

/** Server-only, read-only integration. No purchase-capable transport is exposed. */
export interface ZesimoReadOnlyOptions {
  token: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}
type JsonObject = Record<string, unknown>;
function invalid(): never { throw new ProviderAdapterError('UNAVAILABLE', 'response'); }
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as JsonObject;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function reference(value: string): string {
  if (!/^[1-9]\d{0,14}$/.test(value)) throw new ProviderAdapterError('NOT_CONFIGURED', 'reference');
  return value;
}

export class ZesimoReadOnlyProvider implements EsimProvider {
  readonly id = 'zesimo';
  readonly capabilities: ProviderCapabilities = Object.freeze({
    persistentEsim: false, topUp: false, autoRenew: false, usageReporting: true,
    qrInstall: false, manualInstall: false, activation: false, hotspot: false,
    voice: false, sms: false, phoneNumber: false, suspend: false, resume: false,
    terminate: false, reconciliation: false, simulated: false
  });
  #token: string;
  #fetch: typeof fetch;
  #timeoutMs: number;
  constructor(options: ZesimoReadOnlyOptions) {
    if (typeof window !== 'undefined' || !options.token || /\s/.test(options.token)) {
      throw new ProviderAdapterError('NOT_CONFIGURED', 'authentication');
    }
    const timeout = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30_000) {
      throw new ProviderAdapterError('NOT_CONFIGURED', 'timeout');
    }
    this.#token = options.token;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = timeout;
  }
  private async get(path: string): Promise<JsonObject> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`https://zesimo.com/api/v1${path}`, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.#token}`, Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('request failed');
      return object(await response.json());
    } catch {
      // Never surface provider bodies, tokens, install credentials, URLs or transport errors.
      throw new ProviderAdapterError('UNAVAILABLE', 'read');
    } finally { clearTimeout(timer); }
  }
  async checkAuthentication(): Promise<void> { await this.get('/wallet'); }
  async listProducts(countryCode: string): Promise<ProviderProduct[]> {
    if (countryCode !== 'HT') throw new ProviderAdapterError('UNSUPPORTED', 'country');
    const products: ProviderProduct[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 100; page++) {
      const result = await this.get(`/packages?country=HT&per_page=100&page=${page}`);
      if (!Array.isArray(result.data)) return invalid();
      for (const value of result.data) {
        const item = object(value);
        if (!Array.isArray(item.countries) || !item.countries.includes('HT')) return invalid();
        const plan = object(item.plan);
        // The existing internal model cannot represent daily quotas, flexible durations,
        // unlimited plans, or sub-cent wholesale prices without losing information.
        if (plan.type !== 'fixed_pool' || item.flexible_duration !== false || item.is_unlimited !== false) continue;
        const units = integer(item.price_units);
        if (units % 100 !== 0) continue;
        const id = String(integer(item.id));
        if (id === '0' || seen.has(id)) return invalid();
        seen.add(id);
        const duration = integer(item.duration_days);
        if (duration === 0 || typeof plan.total_gb !== 'number' || !Number.isFinite(plan.total_gb) || plan.total_gb <= 0 || typeof item.name !== 'string' || !item.name) return invalid();
        products.push({ id, countryCode, name: item.name, dataGb: plan.total_gb,
          durationDays: duration, priceCents: units / 100, currency: 'USD', simulated: false });
      }
      const meta = object(result.meta);
      const current = integer(meta.current_page);
      const last = integer(meta.last_page);
      if (current !== page || last < page || last > 100) return invalid();
      if (page === last) return products;
    }
    return invalid();
  }
  async getCoverage(countryCode: string) {
    return { countryCode, available: (await this.listProducts(countryCode)).length > 0, simulated: false };
  }
  private async detail(id: string): Promise<JsonObject> {
    const result = object((await this.get(`/esims/${reference(id)}`)).esim);
    if (String(integer(result.id)) !== id) return invalid();
    return result;
  }
  async getStatus(id: string): Promise<ProviderResult> {
    const detail = await this.detail(id);
    const statuses: Record<string, string> = { pending: 'UNKNOWN', active: 'ACTIVE', cancelled: 'TERMINATED', expired: 'EXPIRED' };
    const status = typeof detail.status === 'string' ? statuses[detail.status] : undefined;
    if (!status) return invalid();
    return { reference: id, status };
  }
  async getUsage(id: string): Promise<Usage> {
    const detail = await this.detail(id);
    const usedBytes = integer(detail.data_used_bytes);
    const totalBytes = integer(detail.data_total_bytes);
    if (usedBytes > totalBytes) return invalid();
    return { esimId: id, usedBytes, totalBytes, measuredAt: new Date().toISOString(), simulated: false };
  }
  async getTopUpEligibility(id: string) {
    const remaining = integer((await this.detail(id)).topups_remaining);
    if (remaining > 3) return invalid();
    return { remaining, canPurchase: false as const, needsNewEsim: remaining === 0 };
  }
  private blocked(operation: string): never { throw new ProviderAdapterError('UNSUPPORTED', operation); }
  async provision(_input: ProvisionRequest): Promise<ProvisionResult> { return this.blocked('provision'); }
  async activate(_id: string): Promise<ProviderResult> { return this.blocked('activation'); }
  async topUp(_input: { reference: string; productId: string; idempotencyKey: string }): Promise<ProviderResult> { return this.blocked('top-up'); }
  async suspend(_id: string): Promise<ProviderResult> { return this.blocked('suspend'); }
  async resume(_id: string): Promise<ProviderResult> { return this.blocked('resume'); }
  async terminate(_id: string): Promise<ProviderResult> { return this.blocked('terminate'); }
  // Throw, never return null: an unknown outcome must not authorize a second order.
  async reconcileByIdempotencyKey(_key: string): Promise<ProviderResult | null> { return this.blocked('reconciliation'); }
}
