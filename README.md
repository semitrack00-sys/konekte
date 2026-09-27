# Konekte MVP foundation

A pnpm workspace for the Konekte customer app, development console, and API. Implements the Phase 1–4 development journey:

Create account → check your phone → choose a plan → test payment → verified payment → prepare demo setup → practice installation → practice activation → example usage.

**Development only. No real internet, phone, SMS, number allocation, or production deployment.** The default eSIM and billing providers are mocks. All prices are `PLACEHOLDER_PRICING`. Production startup is intentionally blocked until a real adapter and approved pricing are implemented.

| Development plan | Data | Duration | USD | Pricing status |
| --- | --- | --- | --- | --- |
| Konekte Basic | 10 GB | 30 days | $9.99 | PLACEHOLDER_PRICING |
| Konekte Plus | 30 GB | 30 days | $14.99 | PLACEHOLDER_PRICING |
| Konekte Max | 50 GB | 30 days | $19.99 | PLACEHOLDER_PRICING |

## Run locally

Prerequisites: Node 22.13+ or Node 24, pnpm 10.28.2, Docker Compose, and several GB of free disk space. iOS native compilation requires macOS/Xcode; Android requires its SDK. Expo web preview needs neither.

```sh
pnpm install
pnpm dev:setup
docker compose --profile test up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`dev:setup` generates an ignored root `.env` with random local-only secrets. It refuses to overwrite an existing file. No Stripe account or provider credentials are needed. `.env.example` documents the configuration, without usable credentials.

Run these in separate terminals:

```sh
pnpm dev:api
pnpm --filter @konekte/api worker
pnpm dev:mobile
pnpm dev:admin
```

API: `http://localhost:4000`; admin: `http://localhost:5173`; mobile: use the Expo CLI web preview. The worker must run to prepare paid demo connections. The admin is a read-only development shell showing public plans and readiness; no privileged customer management endpoints exist yet.

On Windows with PowerShell script execution disabled, use `npm.cmd exec --yes --package=pnpm@10.28.2 -- pnpm <command>` or a locally installed `pnpm.cmd`. CI and normal developer workflows use `pnpm`.

For native phone testing, set `EXPO_PUBLIC_API_URL` to a reachable development API address before starting Expo. The API currently binds to loopback for local development; a LAN proxy or explicit development-only bind change is needed for a physical device. Never expose a development API with mock payment controls to the public internet.

## Try the demo

1. Create an account with a 12+ character password. Choose English, Kreyòl, or Français.
2. Enter a phone model and answer the compatibility questions. This is self-reported, not a hardware inspection or coverage guarantee.
3. Select a plan, continue to payment, then select **Simulate successful payment**. A failure simulation is also available.
4. With the worker running, setup becomes ready. Practice installation and activation in the app. The displayed setup data cannot install an actual eSIM.
5. Open Internet usage to see a clearly labeled example measurement. Phone displays **Phone coming soon**.

Refreshing the browser clears its in-memory session. Native builds store only the refresh token in OS secure storage. Signing in again restores server-side devices and subscriptions; open setup to continue your most recent purchase.

## Validate

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @konekte/mobile build:native-bundles
git diff --check
pnpm scan:secrets
```

`pnpm test` migrates and resets only the dedicated `konekte_test` database. The development database is separate. See [TESTING](docs/TESTING.md) for scope and prerequisites. Build exports are local artifacts, not deployments. No push, deployment, or release workflow is configured.

## Workspace

| Area | Responsibility |
| --- | --- |
| `apps/mobile` | Expo React Native + TypeScript, TanStack Query, React Hook Form, Zustand, secure native refresh storage |
| `apps/admin-web` | React + TypeScript + Vite development console |
| `services/api` | Node/Fastify, Prisma/PostgreSQL, Redis rate limiting, API and separate durable worker |
| `packages/api-client` | Typed fetch client |
| `packages/shared-types` | DTOs, states, provider capabilities, future PhoneProvider contract |
| `packages/shared-validation` | Zod request/form schemas |
| `packages/esim-provider-sdk` | Provider interface, mock adapter, fail-closed factory |
| `packages/ui` | Shared design tokens and complete EN/HT/FR message dictionaries |

Read [architecture](docs/ARCHITECTURE.md), [provider integration](docs/ESIM-INTEGRATION.md), [billing](docs/BILLING.md), and [security](docs/SECURITY.md) before extending these boundaries.
