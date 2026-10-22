# Zesimo integration verification — 2026-10-22

## Result

Partial implementation, not launch-ready. The approved reseller portal was accessed and the official OpenAPI 3.1 specification (API version 1.0.0) retrieved from https://zesimo.com/openapi.yaml, linked by https://zesimo.com/portal/docs. No orders, wallet funding, key creation/revocation, webhook registration or production configuration changes were made.

The issue #1 completion checkboxes are not implementation evidence. PR #2 previously contained only preparation documentation. Authenticated API tests and a purchase-capable sandbox adapter remain blocked.

## Verified contract

- Documented server: `https://zesimo.com/api/v1`. Bearer authentication; ordinary API calls limited to 60/minute/key by default. Do not send credentials in query strings or logs.
- `GET /packages?country=HT` provides paginated catalog data. Prices are USD; `price_units` is in 1/10,000 USD. `reseller_price` already includes any provisioning fee.
- `plan.type` distinguishes fixed pools, daily quotas, unlimited and unknown products. Daily allowances must not be displayed as total allowances. Flexible duration pricing is quoted per selected day count.
- `GET /esims/{id}` returns status, byte usage and `topups_remaining`. At zero, top-up listing/submission returns 422. Maximum three top-ups.
- `POST /orders` supports `Idempotency-Key` (128-character maximum), replay responses and conflict responses. This does NOT establish a GET lookup by key. No such lookup is documented. Do not return a false “not found” or retry with a fresh key after an ambiguous outcome.
- Webhook contract uses HMAC-SHA256 over timestamp + `.` + raw body, a five-minute window, and stable event IDs for durable deduplication. Testing accounts cannot use webhook endpoints. No webhook receiver was activated.

## Haiti evidence and limits

The authenticated portal's name search for Haiti displayed 23 packages, including fixed pools, daily allowances and unlimited-labelled plans. This is not an exhaustive country-coverage API query: regional plans may also cover Haiti. The 1 GB / 7-day detail explicitly listed HT coverage and refunds reviewed by Zesimo.

Account wholesale prices were inspected, but are deliberately omitted from this public repository. The portal labels account pricing confidential and indicative; a fresh authenticated API quote is binding. No account exports, credentials or install payloads are committed. Test prices are synthetic.

Haiti carrier names, per-plan radio technology, tethering, activation deadlines and supported handset/region variants were not verified. Catalog visibility alone is not an on-device network test or device compatibility certification.

## Implemented boundary

`ZesimoReadOnlyProvider` implements the existing `EsimProvider` interface with authenticated GET support for wallet authentication, Haiti fixed-pool catalog/coverage, status, byte usage and top-up eligibility. The token is supplied by server-side secret injection and stored in a private field. HTTPS origin is fixed, redirects are rejected, timeouts are bounded, errors are sanitized, pagination is bounded and retries are disabled.

The existing cents-only product model cannot faithfully represent sub-cent wholesale prices; those products are excluded rather than silently rounded. Daily/unlimited/flexible products are also excluded until the model can preserve their semantics. Coverage reports only the supported fixed-pool subset.

All mutation methods throw before HTTP, as does unresolved reconciliation. `canPurchase` is always false, even with top-ups remaining. No factory registration or catalog import into live database tables is enabled. Existing mock/template behavior remains unchanged. Construct this class only in server-side diagnostic tooling; never pass its token through a mobile or browser bundle.

## Vendor requirements before completion

1. Provide a confirmed non-billable sandbox account/key or documented sandbox mode after reseller approval. The current specification exposes only the current-environment URL; `is_testing` appears in webhook access rules but there is no documented sandbox selector. Do not assume this approved account remains in Test Mode.
2. Provide a secure sandbox token to the server secret store. The portal shows an existing named key but does not reveal its secret. Do not paste secrets into chat or commit them.
3. Confirm durable order lookup after a timeout, concurrent idempotency behavior, retention, and whether flexible `days` participates in conflict detection. Confirm top-up idempotency separately; the order guarantee is not a top-up guarantee.
4. Supply sandbox fixtures/credentials for pending and failed provisioning, installation payloads, usage, three top-ups and terminal 422. Clarify how to exercise signed webhook delivery without enabling production webhook registration.
5. Confirm Haiti networks, device compatibility, activation/expiry behavior, FUP, voice/SMS/number availability and refund semantics. The order endpoint describes atomic rollback, while asynchronous webhook descriptions include partial outcomes and manual refund review; clarify this before accounting integration.

Production purchases and wallet funding remain prohibited. Completing these gates requires authenticated non-billable API evidence, expanded money/plan models, durable reconciliation, pricing approval and separate production authorization.

## Local checks

Run focused tests with `pnpm exec vitest run services/api/test/zesimo.test.ts services/api/test/provider.test.ts` (no vendor calls). Run SDK typecheck/build, repository lint and secret scan. The database-backed full suite additionally requires the dedicated `konekte_test` PostgreSQL database. Fixture tests do not count as authenticated sandbox tests.
