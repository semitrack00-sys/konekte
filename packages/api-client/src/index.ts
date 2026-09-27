import type { Checkout, Device, Esim, InstallData, Locale, Plan, ProviderCapabilities, SafeError, Subscription, Tokens, Usage, User } from '@konekte/shared-types';
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export class ApiClient {
  constructor(private baseUrl: string, private getToken: () => string | null = () => null) {}
  private async request<T>(path: string, method = 'GET', body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const token = this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null) as SafeError | null;
      throw new ApiError(response.status, data?.error?.code ?? 'REQUEST_FAILED', data?.error?.message ?? 'Please try again.');
    }
    return response.json() as Promise<T>;
  }
  register(email: string, password: string, locale: Locale) { return this.request<Tokens>('/api/v1/auth/register', 'POST', { email, password, locale }); }
  login(email: string, password: string) { return this.request<Tokens>('/api/v1/auth/login', 'POST', { email, password }); }
  refresh(refreshToken: string) { return this.request<Tokens>('/api/v1/auth/refresh', 'POST', { refreshToken }); }
  logout() { return this.request<{ ok: true }>('/api/v1/auth/logout', 'POST'); }
  me() { return this.request<User>('/api/v1/me'); }
  plans() { return this.request<Plan[]>('/api/v1/plans'); }
  devices() { return this.request<Device[]>('/api/v1/devices'); }
  addDevice(body: Pick<Device, 'name' | 'supportsEsim' | 'unlocked'>) { return this.request<Device>('/api/v1/devices', 'POST', body); }
  checkout(planId: string, deviceId: string, key: string) { return this.request<Checkout>('/api/v1/checkout', 'POST', { planId, deviceId }, { 'Idempotency-Key': key }); }
  simulatePayment(id: string, outcome: 'success' | 'failure') { return this.request<{ ok: true }>(`/api/v1/checkout/${id}/simulate`, 'POST', { outcome }); }
  subscriptions() { return this.request<Subscription[]>('/api/v1/subscriptions'); }
  esims() { return this.request<Esim[]>('/api/v1/esims'); }
  installData(id: string) { return this.request<InstallData>(`/api/v1/esims/${id}/installation`); }
  installationAction(id: string, action: 'start-install' | 'confirm-install' | 'activate') { return this.request<Esim>(`/api/v1/esims/${id}/installation`, 'POST', { action }); }
  retryProvisioning(id: string) { return this.request<{ ok: true }>(`/api/v1/esims/${id}/retry`, 'POST'); }
  usage() { return this.request<Usage[]>('/api/v1/usage'); }
  capabilities() { return this.request<ProviderCapabilities>('/api/v1/esims/capabilities'); }
  health() { return this.request<{ status: string }>('/health/ready'); }
}
