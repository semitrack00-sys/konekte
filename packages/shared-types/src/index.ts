export const esimStates = ['CREATED', 'READY', 'INSTALLED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED', 'ERROR'] as const;
export const installationStates = ['NOT_CREATED', 'PROVISIONING', 'READY_TO_INSTALL', 'INSTALLING', 'INSTALLED', 'ACTIVATING', 'ACTIVE', 'FAILED'] as const;
export const subscriptionStates = ['PENDING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELING', 'CANCELED', 'EXPIRED'] as const;
export const providerOperationStates = ['PENDING', 'RUNNING', 'SUCCEEDED', 'RETRYABLE_FAILURE', 'FAILED', 'RECONCILIATION_REQUIRED'] as const;
export const providerOperationTypes = ['PROVISION', 'STATUS', 'ACTIVATE', 'TOP_UP', 'USAGE', 'SUSPEND', 'RESUME', 'TERMINATE', 'RECONCILE', 'RENEWAL_PACKAGE'] as const;
export const reconciliationKinds = ['PAID_BUT_NOT_PROVISIONED', 'LOCAL_ACTIVE_PROVIDER_INACTIVE', 'PROVIDER_ACTIVE_LOCAL_PENDING', 'RENEWAL_PAID_PACKAGE_NOT_ASSIGNED', 'USAGE_SYNC_STALE', 'UNKNOWN_PROVIDER_ESIM'] as const;
export type EsimState = typeof esimStates[number];
export type InstallationState = typeof installationStates[number];
export type SubscriptionState = typeof subscriptionStates[number];
export type Locale = 'en' | 'ht' | 'fr';
export type PaymentState = 'PENDING' | 'SUCCEEDED' | 'FAILED';
export type ProviderOperationState = typeof providerOperationStates[number];
export type ProviderOperationType = typeof providerOperationTypes[number];
export type ReconciliationKind = typeof reconciliationKinds[number];
export type ReconciliationStatus = 'OPEN' | 'RESOLVED';
export type ProviderEsimStatus = 'UNKNOWN' | 'READY' | 'INSTALLED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TERMINATED' | 'ERROR';
export interface Plan { id: string; name: string; dataGb: number; durationDays: number; priceCents: number; currency: string; pricingLabel: 'PLACEHOLDER_PRICING' }
export interface User { id: string; email: string; locale: Locale }
export interface Tokens { accessToken: string; refreshToken: string; user: User }
export interface Device { id: string; name: string; supportsEsim: boolean; unlocked: boolean; compatible: boolean; verification: 'SELF_REPORTED' }
export interface ProviderCapabilities { persistentEsim: boolean; topUp: boolean; autoRenew: boolean; usageReporting: boolean; qrInstall: boolean; manualInstall: boolean; activation: boolean; hotspot: boolean; voice: boolean; sms: boolean; phoneNumber: boolean; suspend: boolean; resume: boolean; terminate: boolean; reconciliation: boolean; simulated: boolean }
export interface ProviderCoverage { countryCode: string; available: boolean; simulated: boolean }
export interface ProviderProduct { id: string; countryCode: string; name: string; dataGb: number; durationDays: number; priceCents: number; currency: string; simulated: boolean }
export type ProviderReadiness = 'CONFIGURED' | 'NOT_CONFIGURED' | 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';
export type QualificationAnswer = 'UNKNOWN' | 'YES' | 'NO' | 'NOT_APPLICABLE';
export interface HaitiProviderQualification { countryCode: 'HT'; haitiSupported: QualificationAnswer; networkNames: string[]; lte4g: QualificationAnswer; fiveG: QualificationAnswer; persistentEsim: QualificationAnswer; topUpSameEsim: QualificationAnswer; packageReplacement: QualificationAnswer; usageApi: QualificationAnswer; usageWebhook: QualificationAnswer; hotspotTetheringPolicy: string | null; throttlingFup: string | null; packageExpirationBehavior: string | null; activationMethod: string | null; qrInstallation: QualificationAnswer; manualInstallation: QualificationAnswer; webhookAuthentication: string | null; idempotencySupport: QualificationAnswer; reconciliationSupport: QualificationAnswer; failedProvisioningRefundBehavior: string | null; sandboxAvailable: QualificationAnswer; productionAvailable: QualificationAnswer; commercialMinimums: Record<string, unknown> | null; wholesaleCurrency: string | null }
export interface ProviderOperation { id: string; operationType: ProviderOperationType; entityType: string; entityId: string; providerId: string; providerRequestId: string | null; providerReferenceId: string | null; idempotencyKey: string; status: ProviderOperationState; attempts: number; safeErrorCode: string | null; createdAt: string; updatedAt: string }
export interface ReconciliationIssue { id: string; kind: ReconciliationKind; entityType: string; entityId: string; providerId: string | null; status: ReconciliationStatus; safeDetails: string; detectedAt: string }
export interface InstallData { simulated: boolean; qrPayload: string; manual: { address: string; code: string }; instructions: string }
export interface Esim { id: string; subscriptionId: string; state: EsimState; installationState: InstallationState; simulated: boolean; provider: string }
export interface Subscription { id: string; state: SubscriptionState; plan: Plan; periodStart: string | null; periodEnd: string | null; payment: { id: string; state: PaymentState; mode: 'mock' | 'stripe_test'; checkoutUrl: string | null } | null; esim: Esim | null }
export interface Checkout { subscriptionId: string; paymentId: string; checkoutUrl: string | null; mode: 'mock' | 'stripe_test'; state: PaymentState }
export interface Usage { esimId: string; usedBytes: number; totalBytes: number; measuredAt: string; simulated: boolean }
export interface SafeError { error: { code: string; message: string; requestId?: string } }
/** Reserved boundary only. No phone service, allocation, or number generation in this MVP. */
export interface PhoneProvider { readonly capabilities: { voice: boolean; sms: boolean }; availability(): Promise<'UNAVAILABLE' | 'AVAILABLE'> }
