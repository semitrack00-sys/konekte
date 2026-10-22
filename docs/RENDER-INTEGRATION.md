# Read-only Render preparation

The root `render.yaml` prepares `konekte-integration`, an isolated Node service in Oregon on the free web plan. It is not the customer API, and does not import its routes, database runtime, billing controls or worker. The original API's production guard and loopback binding remain unchanged.

The service exposes only public `GET /health` and authenticated `GET /internal/zesimo/check`. Diagnostics require `Authorization: Bearer <KONEKTE_DIAGNOSTIC_TOKEN>`, use a constant-time comparison, suppress logs and return no wallet amounts or provider payloads. A successful diagnostic performs exactly one read-only wallet GET. Checks are limited to one per minute per process and never run on health probes. No purchases or wallet funding are possible through this host.

Render generates the diagnostic token. Enter the existing Zesimo key as `ZESIMO_API_KEY` directly in Render's secret field. Never put either secret in chat, GitHub, URLs or frontend variables. No Zesimo key is stored in this repository. Missing diagnostic token prevents startup; missing Zesimo key leaves health available but diagnostics unavailable.

Build: `corepack pnpm@10.28.2 install --frozen-lockfile --prod=false && corepack pnpm@10.28.2 db:generate && corepack pnpm@10.28.2 --filter @konekte/api build`

Start: `node services/api/dist/integration-server.js`. Binds `0.0.0.0:$PORT`; health path `/health`. Prisma client generation is build-only; this host does not connect to a database.

Automatic deploys are disabled. Review the linked branch and service type before applying. Do not change the start command to the original server or expose local mock-payment routes. Free hosting is intended for integration checks, not a customer availability commitment.

Local validation: 52 focused host/provider/security tests, API typecheck/build, repository lint and focused secret scan pass. Blueprint JSON Schema validation is structural only; Render platform validation and actual deployment verification are still required. The Render CLI is not installed in the current workspace. No database-backed integration suite or authenticated Zesimo tests have been run.

Deployment and secure key entry are separate steps. A healthy endpoint does not prove the Zesimo key is valid; run the authenticated diagnostic after configuring it. Sandbox purchase testing remains blocked pending vendor confirmation.
