# Zesimo sandbox integration checklist

Tracking: #1. This branch now contains an isolated **read-only adapter**, not a purchase-capable sandbox integration. See [verification and remaining vendor requirements](ZESIMO-VERIFICATION-2026-10-22.md). Do not set `ESIM_PROVIDER=zesimo`; factory activation remains disabled.

## Confirmed from vendor correspondence (September 28 and October 21, 2026)

- Zesimo offers API Integration, Partner Portal and Brand Studio.
- Test Mode permits API exploration, catalog review and Tier 1 wholesale prices without a minimum deposit, setup fee or commitment.
- Tier 2: deposit USD 1,000, receive USD 1,100 wallet credit. Tier 3: deposit USD 5,000, receive USD 6,000.
- An eSIM supports **at most three top-ups**. `GET /esims/{id}` now exposes `topups_remaining`. At zero, top-up package retrieval and top-up submission return HTTP 422 without a charge.

## Original discovery checklist (superseded by the dated verification report)

1. Sandbox base URL, authentication scheme, credential generation and rate limits.
2. Official endpoint definitions and sample redacted payloads for catalog, coverage, ordering, installation details, activation, status, usage, top-up and reconciliation.
3. Provider idempotency guarantee and order lookup after network timeout; callback authentication and event schema.
4. Verified Haiti (HT) coverage, networks, products, wholesale prices, validity, supported devices and supported capabilities.
5. Explicit confirmation whether Haiti plans are data-only or include voice, SMS and telephone numbers.

## Implementation requirements

- Keep existing mock/demo behavior unchanged and preserve production fail-closed gates.
- Add an isolated adapter under `packages/esim-provider-sdk/src/adapters/zesimo/` only after validating the vendor contract. Do not guess API routes, payloads or authorization headers.
- Keep all credentials server-side in secrets/environment configuration; never commit tokens, test credentials or customer eSIM QR data.
- Map verified catalog items to internal product mappings; do not use placeholder prices for live sales.
- Preserve durable idempotency and reconciliation; a timeout must never trigger a second purchase with a new key.
- Check `topups_remaining` before showing or submitting top-ups; at zero, offer a new eSIM. Treat 422 as a terminal business rule, not a retryable transport failure.
- Explicitly disable unsupported features (including phone number, SMS, calling, suspension and renewal) rather than simulating success.
- Require authenticated sandbox tests, lint, typecheck, full tests, build and secret scan before review.

## Launch gate

No wallet funding, production purchases, customer release or production environment switch without separately approved pricing, verified Haiti coverage, end-to-end sandbox evidence and explicit user authorization.
