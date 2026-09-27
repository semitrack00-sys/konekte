# Security

## Implemented controls

- Environment-only configuration; ignored `.env`, blank secret examples, randomly generated development values. Runtime configuration errors report field names, never secret values.
- Salted Node scrypt password hashes, length-limited passwords and email normalization. Unknown-account login performs a dummy hash verification. Login failures share one safe message.
- Signed HS256 access JWTs expire in 10 minutes and validate issuer/audience/algorithm. Every authenticated request checks that its session is still valid and unrevoked.
- Random 48-byte refresh tokens are stored only as SHA-256 hashes server-side. Rotation revokes the old session. Reuse revokes the entire family under a database lock. Refresh expiration is a fixed 30 days from login, not indefinite sliding expiration.
- Native refresh storage uses Expo SecureStore. Browser preview uses memory only. Access tokens never persist to browser local storage.
- Strict Zod request parsing, body limits, safe errors and owner filters. Every object lookup remains scoped to the authenticated account; ownership cannot be supplied in input.
- Redis-backed request and tighter auth/checkout limits. Redis errors fail closed. Proxy headers are not trusted by default; deployment behind a proxy requires an explicit trust model.
- CORS allowlist, security headers, no-store customer responses, no default raw request/body logging.
- Signed raw-byte webhook verification, timestamp tolerance, amount/currency/session matching, live-mode rejection and transactional deduplication.
- AES-256-GCM activation field encryption. A fresh IV per value, authentication tag and eSIM ID context prevent swapping ciphertext between accounts. Encryption keys are environment-only; lists and logs omit activation fields.
- Database leases, unique constraints and stable adapter idempotency keys prevent duplicate logical fulfillment. Provider exceptions are never logged or returned verbatim.
- Docker database and Redis ports bind to local loopback. Development DB credentials are generated, not hardcoded. The API binds to loopback.

## Before any production work

Production deliberately fails closed. Required future work includes audited real provider integration, nonplaceholder pricing approval, trusted install/activation callbacks, reliable provider reconciliation, TLS/secrets-manager deployment, key rotation and re-encryption, email verification/password reset, operational monitoring/alerting, migration/backups/recovery drills, retention/deletion policy, admin RBAC and audit trails, dependency/security review, and native device acceptance tests.

There is no real service or financial authorization in mock mode. Access to development mock payment simulation must stay local. The admin shell exposes only already-public catalog/readiness data; it grants no administrative authority.

The repository's secret scanner checks common private keys, Stripe/GitHub/AWS token patterns, tracked env files and fabricated Haitian-format phone numbers. It is a focused guard, not a substitute for reviewing diffs and secret-manager practices. Never paste provider payloads or credentials into logs, tests or bug reports.
