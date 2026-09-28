import { randomUUID } from 'node:crypto';
import type { EsimProvider, ProviderWebhookVerifier } from './contracts/index.js';
import { ProviderAdapterError } from './contracts/index.js';

export type SandboxCheckStatus = 'PASS' | 'FAIL' | 'SKIP';
export interface SandboxCheck { name: string; status: SandboxCheckStatus; errorCode?: string }
export interface SandboxVerificationOptions {
  environment: 'SANDBOX' | 'PRODUCTION';
  countryCode: string;
  allowDestructiveOperations?: boolean;
  webhookVerifier?: ProviderWebhookVerifier;
  webhookProbe?: { rawBody: Buffer; signature: string };
}

/** Opt-in sandbox-only contract probe. Never returns raw provider payloads or error messages. */
export async function verifyProviderSandbox(provider: EsimProvider, options: SandboxVerificationOptions): Promise<SandboxCheck[]> {
  if (options.environment !== 'SANDBOX') throw new Error('Sandbox verification cannot run against production.');
  const checks: SandboxCheck[] = [];
  const run = async (name: string, action: () => Promise<unknown>) => {
    try { await action(); checks.push({ name, status: 'PASS' }); return true; }
    catch (error) { checks.push({ name, status: 'FAIL', errorCode: error instanceof ProviderAdapterError ? error.code : 'PROVIDER_ERROR' }); return false; }
  };
  await run('authentication', () => provider.checkAuthentication());
  const coverageOk = await run('haiti_coverage', () => provider.getCoverage(options.countryCode));
  let products: Awaited<ReturnType<EsimProvider['listProducts']>> = [];
  const catalogOk = await run('catalog', async () => { products = await provider.listProducts(options.countryCode); });
  const product = products[0];
  const key = `sandbox-contract:${randomUUID()}`;
  let reference: string | undefined;
  if (catalogOk && product) {
    const input = { idempotencyKey: key, planId: 'sandbox-contract', productId: product.id, dataGb: product.dataGb, durationDays: product.durationDays };
    await run('provision', async () => { const first = await provider.provision(input); const second = await provider.provision(input); if (first.reference !== second.reference) throw new Error('IDEMPOTENCY_MISMATCH'); reference = first.reference; });
  } else checks.push({ name: 'provision', status: 'SKIP', errorCode: coverageOk ? 'NO_CATALOG_PRODUCT' : 'COVERAGE_UNAVAILABLE' });
  if (reference) {
    await run('reconciliation', async () => { if (!await provider.reconcileByIdempotencyKey(key)) throw new ProviderAdapterError('UNAVAILABLE', 'reconciliation'); });
    await run('status_lookup', () => provider.getStatus(reference!));
    if (provider.capabilities.persistentEsim && provider.capabilities.topUp) await run('same_esim_top_up', async () => { const result = await provider.topUp({ reference: reference!, productId: product!.id, idempotencyKey: `${key}:top-up` }); if (result.reference !== reference) throw new Error('PROFILE_CHANGED'); });
    else checks.push({ name: 'same_esim_top_up', status: 'SKIP', errorCode: 'UNSUPPORTED' });
    if (provider.capabilities.usageReporting) await run('usage_lookup', () => provider.getUsage(reference!));
    else checks.push({ name: 'usage_lookup', status: 'SKIP', errorCode: 'UNSUPPORTED' });
    if (provider.capabilities.suspend && provider.capabilities.resume) {
      await run('suspend_resume', async () => { await provider.activate(reference!); await provider.suspend(reference!); await provider.resume(reference!); });
    } else checks.push({ name: 'suspend_resume', status: 'SKIP', errorCode: 'UNSUPPORTED' });
    if (provider.capabilities.terminate && options.allowDestructiveOperations) await run('terminate', () => provider.terminate(reference!));
    else checks.push({ name: 'terminate', status: 'SKIP', errorCode: provider.capabilities.terminate ? 'EXPLICIT_OPT_IN_REQUIRED' : 'UNSUPPORTED' });
  }
  if (options.webhookVerifier && options.webhookProbe) {
    const verified = options.webhookVerifier.verify(options.webhookProbe.rawBody, options.webhookProbe.signature);
    checks.push({ name: 'webhook_signature', status: verified ? 'PASS' : 'FAIL', ...(!verified ? { errorCode: 'INVALID_SIGNATURE' } : {}) });
  } else checks.push({ name: 'webhook_signature', status: 'SKIP', errorCode: 'PROBE_NOT_CONFIGURED' });
  return checks;
}
