# eSIM provider integration

`ESIM_PROVIDER=mock` is the only supported adapter. The application depends on `EsimProvider`, not a telecom vendor SDK. The interface lives in `packages/esim-provider-sdk`; public data shapes and capabilities live in shared types. Unknown providers fail; there is no automatic mock fallback.

## Contract

An adapter supplies `getCoverage`, `listProducts`, `provision`, `getStatus`, `activate`, `topUp`, `getUsage`, `suspend`, `resume`, `terminate`, and `reconcileByIdempotencyKey`, plus explicit capability flags. The contract includes persistent-profile, top-up, auto-renew, usage, QR/manual setup, activation, hotspot, voice, SMS, phone-number, and simulation support.

Konekte plan IDs remain the customer-facing identifiers. `PlanProviderMapping` joins each plan and provider to a `ProviderProduct`; provider product IDs are only resolved by server-side workflows and are never returned in plan DTOs.

Adapters must guarantee durable idempotency for the complete retry/reconciliation period, including process restarts and ambiguous network timeouts. A real adapter needs its own plan mapping, HTTP timeouts, safe error mapping, authenticated callback handling and reconciliation by the idempotency key. If a supplier cannot support this, build a reconciliation layer before enabling it. A provider timeout must never trigger a blind purchase under a new key.

The mock uses deterministic references, `mock.invalid` manual setup address, and non-installable QR data. It never emits valid LPA data or phone numbers. Example usage is a fixed 256,000,000 bytes, not measured network traffic. Mock ACTIVE is explicitly a simulation. Its catalog and coverage values are mock values, not a coverage promise.

## Operations and renewal

`ProviderOperation` records operation type, Konekte entity, provider request/reference, unique idempotency key, attempts, state and a safe error code. States are `PENDING`, `RUNNING`, `SUCCEEDED`, `RETRYABLE_FAILURE`, `FAILED`, and `RECONCILIATION_REQUIRED`. Provider webhooks retain raw bytes for an injected verifier, persist unique provider/event IDs, and acknowledge unsupported event types without interpreting vendor-specific names.

Reconciliation creates review flags for paid purchases without eSIMs, state disagreements, missing renewal assignments, stale usage and unknown provider references. It never changes customer or provider state automatically. The development admin exposes operation summaries and open flags without blind retry controls.

Monthly renewal is initiated through an authenticated checkout. A verified payment creates one idempotent top-up operation, and the existing eSIM is reused only when both persistent profiles and top-ups are supported. The next subscription period is written only after the provider confirms package assignment. Provider auto-renew is a separate capability and is not assumed. Renewal support requires an active local eSIM, an active mapping, and matching provider capabilities.

## Durable provisioning

1. A verified paid event creates an eSIM and provisioning job in one transaction.
2. A worker claims a job using a row lock and a 60-second lease. Other workers skip locked jobs.
3. The adapter receives the subscription ID as its stable idempotency key.
4. Successful setup fields are encrypted using AES-256-GCM with the eSIM ID as authenticated context.
5. Job completion and encrypted field persistence are atomic. A lease token prevents a stale worker from overwriting a newer claim.
6. Failures store only `PROVIDER_UNAVAILABLE`. Three attempts with exponential backoff lead to an exhausted job; the owner can explicitly retry it. Expired leases recover automatically.

Exactly-once network calls cannot be promised. Exactly-once logical provisioning depends on adapter idempotency plus the database's unique subscription/eSIM/job constraints. Mock behavior satisfies this by construction, including across restarts.

## Installation data

```ts
interface InstallData {
  simulated: boolean;
  qrPayload: string;
  manual: { address: string; code: string };
  instructions: string;
}
```

Only the owner can fetch decrypted data. It is never included in list endpoints or logs. Clients do not claim a real install or connection from a button press. The practice endpoints are restricted to simulated adapters; real integration needs trusted provider/device confirmation. Phone compatibility is currently self-reported, and actual coverage/device eligibility must be verified by the future provider.

`PhoneProvider` is a future contract only. Calling, texting and number allocation are not implemented.
