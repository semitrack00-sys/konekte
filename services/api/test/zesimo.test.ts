import { describe, expect, it, vi } from 'vitest';
import { ZesimoReadOnlyProvider } from '../../../packages/esim-provider-sdk/src/adapters/zesimo/index.js';
import { createEsimProvider } from '../../../packages/esim-provider-sdk/src/index.js';

const product = { id: 42, name: 'Synthetic Haiti fixture', countries: ['HT'], plan: { type: 'fixed_pool', total_gb: 3 }, data_gb: 3, duration_days: 30, price_units: 120000, flexible_duration: false, is_unlimited: false };
const page = (data: unknown[] = [product], current = 1, last = 1) => ({ data, meta: { current_page: current, last_page: last } });
function fixture(body: unknown, status = 200) {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  return { transport, provider: new ZesimoReadOnlyProvider({ token: 'synthetic-test-token', fetch: transport }) };
}
describe('Zesimo isolated read-only contract', () => {
  it('is not activated by the production factory', () => {
    expect(() => createEsimProvider('zesimo', 'production')).toThrow('not configured');
    expect(createEsimProvider('mock', 'test').id).toBe('mock');
  });
  it('maps exact-cent fixed pools using official price units and only sends GET', async () => {
    const { provider, transport } = fixture(page());
    expect(await provider.listProducts('HT')).toEqual([{ id: '42', name: product.name, countryCode: 'HT', dataGb: 3, durationDays: 30, priceCents: 1200, currency: 'USD', simulated: false }]);
    expect(transport).toHaveBeenCalledWith('https://zesimo.com/api/v1/packages?country=HT&per_page=100&page=1', expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer synthetic-test-token', Accept: 'application/json' } }));
    expect(JSON.stringify(provider)).not.toContain('synthetic-test-token');
  });
  it('paginates without following untrusted links', async () => {
    const { provider, transport } = fixture(page());
    transport.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ ...page([product], 1, 2), links: { next: 'https://attacker.invalid' } }))).mockResolvedValueOnce(new Response(JSON.stringify(page([{ ...product, id: 43 }], 2, 2))));
    expect(await provider.listProducts('HT')).toHaveLength(2);
    expect(transport.mock.calls[1]?.[0]).toBe('https://zesimo.com/api/v1/packages?country=HT&per_page=100&page=2');
  });
  it('excludes daily, unlimited, flexible and sub-cent prices instead of misrepresenting them', async () => {
    const { provider } = fixture(page([{ ...product, plan: { type: 'daily_quota' } }, { ...product, is_unlimited: true }, { ...product, flexible_duration: true }, { ...product, price_units: 120001 }]));
    expect(await provider.listProducts('HT')).toEqual([]);
  });
  it.each([page([{ ...product, countries: ['US'] }]), page([product, product]), page([product], 2), page([product], 1, 101), page([{ ...product, price_units: -1 }]), page([{ ...product, plan: null }]), {}])('rejects malformed catalogs', async body => {
    await expect(fixture(body).provider.listProducts('HT')).rejects.toThrow();
  });
  it.each([401, 402, 409, 422, 429, 500, 502])('sanitizes HTTP %i without retry', async status => {
    const { provider, transport } = fixture({ message: 'private-provider-payload' }, status);
    await expect(provider.checkAuthentication()).rejects.toThrow('Provider operation read is unavailable');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('aborts slow requests and sanitizes transport errors', async () => {
    const transport = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('private-token')));
    }));
    const provider = new ZesimoReadOnlyProvider({ token: 'synthetic', timeoutMs: 5, fetch: transport });
    await expect(provider.checkAuthentication()).rejects.toThrow('Provider operation read is unavailable');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('maps status and exact bytes without exposing installation data', async () => {
    const { provider, transport } = fixture({ esim: { id: 5, status: 'active', data_used_bytes: 20, data_total_bytes: 100, activation_code: 'secret-install' } });
    expect(await provider.getStatus('5')).toEqual({ reference: '5', status: 'ACTIVE' });
    transport.mockResolvedValue(new Response(JSON.stringify({ esim: { id: 5, data_used_bytes: 20, data_total_bytes: 100 } })));
    expect(await provider.getUsage('5')).toMatchObject({ usedBytes: 20, totalBytes: 100, simulated: false });
  });
  it.each([null, -1, 4])('rejects invalid remaining top-ups %s', async remaining => {
    await expect(fixture({ esim: { id: 5, topups_remaining: remaining } }).provider.getTopUpEligibility('5')).rejects.toThrow();
  });
  it.each([0, 1, 2, 3])('enforces remaining top-ups %i without permitting purchases', async remaining => {
    expect(await fixture({ esim: { id: 5, topups_remaining: remaining } }).provider.getTopUpEligibility('5')).toEqual({ remaining, canPurchase: false, needsNewEsim: remaining === 0 });
  });
  it('rejects unsupported country and path injection before HTTP', async () => {
    const { provider, transport } = fixture({});
    await expect(provider.listProducts('US')).rejects.toThrow();
    await expect(provider.getStatus('../wallet')).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('blocks all mutations and ambiguous reconciliation before HTTP', async () => {
    const { provider, transport } = fixture({});
    const calls = [provider.provision({ idempotencyKey: 'key', dataGb: 1, durationDays: 7 }), provider.topUp({ reference: '5', productId: '42', idempotencyKey: 'key' }), provider.activate('5'), provider.suspend('5'), provider.resume('5'), provider.terminate('5'), provider.reconcileByIdempotencyKey('key')];
    for (const call of calls) await expect(call).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(provider.capabilities.topUp).toBe(false);
  });
});
