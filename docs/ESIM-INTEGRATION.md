# eSIM provider integration

`ESIM_PROVIDER=mock` is the only supported adapter. The application depends on `EsimProvider`, not a telecom vendor SDK. The interface lives in `packages/esim-provider-sdk`; public data shapes and capabilities live in shared types. Unknown providers fail; there is no automatic mock fallback.

## Contract

An adapter supplies:

- `id` and capabilities: data, QR/manual setup, usage, activation, voice, SMS, simulation.
- `provision({ idempotencyKey, planCode, dataGb, durationDays })`: stable provider reference and install data.
- `activate(reference)`: trusted provider activation state.
- `usage(reference)`: byte measurement and timestamp.

Adapters must guarantee durable idempotency for the complete retry/reconciliation period, including process restarts and ambiguous network timeouts. A real adapter needs its own plan mapping, HTTP timeouts, safe error mapping, authenticated callback handling and reconciliation by the idempotency key. If a supplier cannot support this, build a reconciliation layer before enabling it. A provider timeout must never trigger a blind purchase under a new key.

The mock uses deterministic references, `mock.invalid` manual setup address, and `KONEKTE-DEMO-NOT-INSTALLABLE:` QR data. It never emits valid LPA data or phone numbers. Example usage is a fixed 256,000,000 bytes, not measured network traffic. Mock ACTIVE is explicitly a simulation.

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
