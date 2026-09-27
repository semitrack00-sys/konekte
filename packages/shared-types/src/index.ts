export const esimStates = ['CREATED', 'READY', 'INSTALLED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'ERROR'] as const;
export const installationStates = ['NOT_CREATED', 'PROVISIONING', 'READY_TO_INSTALL', 'INSTALLING', 'INSTALLED', 'ACTIVATING', 'ACTIVE', 'FAILED'] as const;
export const subscriptionStates = ['PENDING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELING', 'CANCELED', 'EXPIRED'] as const;
export type EsimState = typeof esimStates[number];
export type InstallationState = typeof installationStates[number];
export type SubscriptionState = typeof subscriptionStates[number];
export type Locale = 'en' | 'ht' | 'fr';
export type PaymentState = 'PENDING' | 'SUCCEEDED' | 'FAILED';
export interface Plan { id: string; name: string; dataGb: number; durationDays: number; priceCents: number; currency: string; pricingLabel: 'PLACEHOLDER_PRICING' }
export interface User { id: string; email: string; locale: Locale }
export interface Tokens { accessToken: string; refreshToken: string; user: User }
export interface Device { id: string; name: string; supportsEsim: boolean; unlocked: boolean; compatible: boolean; verification: 'SELF_REPORTED' }
export interface ProviderCapabilities { data: boolean; qrInstall: boolean; manualInstall: boolean; usage: boolean; activation: boolean; voice: false; sms: false; simulated: boolean }
export interface InstallData { simulated: boolean; qrPayload: string; manual: { address: string; code: string }; instructions: string }
export interface Esim { id: string; subscriptionId: string; state: EsimState; installationState: InstallationState; simulated: boolean; provider: string }
export interface Subscription { id: string; state: SubscriptionState; plan: Plan; payment: { id: string; state: PaymentState; mode: 'mock' | 'stripe_test'; checkoutUrl: string | null } | null; esim: Esim | null }
export interface Checkout { subscriptionId: string; paymentId: string; checkoutUrl: string | null; mode: 'mock' | 'stripe_test'; state: PaymentState }
export interface Usage { esimId: string; usedBytes: number; totalBytes: number; measuredAt: string; simulated: boolean }
export interface SafeError { error: { code: string; message: string; requestId?: string } }
/** Reserved boundary only. No phone service, allocation, or number generation in this MVP. */
export interface PhoneProvider { readonly capabilities: { voice: boolean; sms: boolean }; availability(): Promise<'UNAVAILABLE' | 'AVAILABLE'> }
