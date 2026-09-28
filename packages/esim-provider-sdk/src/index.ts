import type { ProviderAdapterConfiguration } from './contracts/index.js';
import type { EsimProvider } from './contracts/index.js';
import { MockEsimProvider } from './mock/index.js';
import { TemplateEsimProvider } from './adapters/template/index.js';
export * from './contracts/index.js';
export { MockEsimProvider, MockProviderWebhookVerifier } from './mock/index.js';
export { TemplateEsimProvider } from './adapters/template/index.js';
export { verifyProviderSandbox, type SandboxCheck, type SandboxVerificationOptions } from './verification.js';

export function createEsimProvider(provider: string, environment: string, config?: ProviderAdapterConfiguration): EsimProvider {
  if (environment === 'production' && provider === 'mock') throw new Error('A real eSIM provider must be configured for production.');
  if (provider === 'mock') return new MockEsimProvider();
  if (provider === 'template') return new TemplateEsimProvider(config);
  throw new Error('Provider adapter is not configured.');
}
