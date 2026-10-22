import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { buildIntegrationApp } from '../src/integration-app.js';

describe('read-only integration host', () => {
  const token = randomBytes(32).toString('hex');
  const env = { KONEKTE_DIAGNOSTIC_TOKEN: token, ZESIMO_API_KEY: 'synthetic-test-key' };
  it('fails startup without diagnostic authentication', async () => {
    await expect(buildIntegrationApp({})).rejects.toThrow('KONEKTE_DIAGNOSTIC_TOKEN');
  });
  it('serves health without provider calls, rejects anonymous diagnostics and has no purchase routes', async () => {
    const transport = vi.fn<typeof fetch>();
    const app = await buildIntegrationApp(env, transport);
    try {
      expect((await app.inject('/health')).json()).toMatchObject({ purchasesEnabled: false });
      expect((await app.inject('/internal/zesimo/check')).statusCode).toBe(401);
      for (const url of ['/orders', '/checkout', '/esims/1/topup']) expect((await app.inject({ method: 'POST', url })).statusCode).toBe(404);
      expect(transport).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('allows only a rate-limited wallet GET and omits provider data', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ balance: 'private' })));
    const app = await buildIntegrationApp(env, transport);
    const headers = { authorization: `Bearer ${token}` };
    try {
      const result = await app.inject({ url: '/internal/zesimo/check', headers });
      expect(result.json()).toEqual({ authenticated: true, purchasesEnabled: false });
      expect(result.headers['cache-control']).toBe('no-store');
      expect((await app.inject({ url: '/internal/zesimo/check', headers })).statusCode).toBe(429);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0]?.[0]).toBe('https://zesimo.com/api/v1/wallet');
      expect(transport.mock.calls[0]?.[1]?.method).toBe('GET');
    } finally { await app.close(); }
  });
  it('reports missing key without calling provider', async () => {
    const app = await buildIntegrationApp({ KONEKTE_DIAGNOSTIC_TOKEN: token });
    try { expect((await app.inject({ url: '/internal/zesimo/check', headers: { authorization: `Bearer ${token}` } })).json()).toEqual({ error: 'ZESIMO_KEY_NOT_CONFIGURED' }); }
    finally { await app.close(); }
  });
});
