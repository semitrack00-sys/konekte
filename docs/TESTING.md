# Testing and validation

## Run

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
docker compose --profile test up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @konekte/mobile build:native-bundles
git diff --check
pnpm scan:secrets
```

Skip `dev:setup` when `.env` already exists. The test command loads environment configuration and requires the URL database name to be exactly `konekte_test`. It deploys migrations first, then runs Vitest. Integration tests truncate only that dedicated database. They clear only the test rate-limit namespace, never the Redis database. No external provider or Stripe connection is made.

## Coverage

Database-backed tests exercise Fastify via HTTP injection and use actual PostgreSQL transactions and Redis. Coverage includes auth registration/login/logout, password protection, short-lived JWTs, refresh rotation/replay, validation, rate limits, readiness failure, catalog prices, incompatible device rejection, server-side price protection, concurrent checkout, checkout-key conflicts, signed payment success/failure, event deduplication, out-of-order events, stale/invalid signatures, live/mismatched/unpaid event rejection, encrypted provisioning, competing workers, abandoned leases, provider retry/exhaustion, ordered installation, activation failure, usage caching, subscription expiry and cross-user access restrictions.

Security unit tests cover password salts, authenticated encryption context, fail-closed configuration, Stripe test-only guards and mock adapter idempotency/noninstallable data.

## Build scope

- Shared packages: TypeScript compilation/declarations.
- API and worker: Node ESM bundles.
- Admin: Vite browser build.
- Mobile: Expo web export; separate iOS and Android JavaScript/Hermes bundle export.

Native exports are not signed IPA/APK builds and do not replace emulator/physical device tests. The suite does not exercise a real Stripe sandbox account, real provider, real QR installation or network connectivity. React Native SecureStore needs device testing. The foundation has no production deployment workflow.

GitHub Actions repeats installation, database migration/seed, lint, typecheck, tests, builds, whitespace and secret scanning using disposable local Docker services. Local validation results belong in the task completion report; do not assume unrun CI has passed.
