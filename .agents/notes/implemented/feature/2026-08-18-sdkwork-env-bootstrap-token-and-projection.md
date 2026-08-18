# Agent Note: SDKWork env bootstrap token generation and ui-env projection

Status: implemented

English | [中文](2026-08-18-sdkwork-env-bootstrap-token-and-projection.zh.md)

## Problem

The env-file standard ([2026-08-17-sdkwork-env-file-standard.md](../process/2026-08-17-sdkwork-env-file-standard.md)) materialized templates only, and the `SDKWORK_ACCESS_TOKEN` key had no code consumer: every SDKWork integration plugin initialized its SDK from the settings-driven `ui-env` profile, whose `accessToken` field had no writer, so testing another environment meant hand-editing `$DSH_HOME/settings.yaml` and manually provisioning a token. The product needed tracked materialized env files, automatic bootstrap token provisioning at startup (per sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1), and a single env-to-SDK path so all seven SDKWork plugins initialize from the env files.

## Decision

- **Tracked materialized env files**: `.env.standalone.development`, `.env.standalone.test`, and `.env.standalone.production` at the repo root carry identity keys, surface URLs, and placeholder credentials only (section 5.1); `.env.example` remains the generic template, and the previous `.env.standalone.*.example` files were deleted. `sdkwork.app.config.json` (schemaVersion 3, `backend.appId=sdkwork-birdcoder`) is the registration and token-generation manifest.
- **Startup token ensure** (`@deepseek-ai/dsh-sdkwork-env-bootstrap`, new `packages/boot` package): the `dsh` CLI and the desktop shell call `ensureSdkworkBootstrapToken` after the layered `.env` load. Precedence: an explicitly configured `SDKWORK_ACCESS_TOKEN`, then the registration output `.sdkwork.local.env`, then generation — development generates a disposable local JWT into the gitignored `.env.standalone.development.bootstrap.local` overlay, test requires `--allow-test-token-generation`, staging/production fail closed to a private secret source. An ensured token is materialized into `process.env` for the ui-env host projection. All JWT creation, manifest lookup, and env-file parsing reuse `@sdkwork/iam-credential-entry` (loaded dynamically, so a harness without SDKWork siblings still boots). Unpackaged `pnpm desktop:dev` calls `applySdkworkDesktopLaunchEnv` first so the development gateway is projected even when Electron's cwd is `apps/desktop`; a packaged build applies the production gateway ([desktop:dev vs packaged gateways](../bug-fix/2026-08-18-desktop-dev-development-gateway.md)).
- **One-command registration** (`pnpm run admin:bootstrap:app`, `scripts/sdkwork-app-bootstrap.ts`): register → provision → enable → access credential through `@sdkwork/iam-application-bootstrap`, authenticating with the super-admin profile (`~/.sdkwork/users/super-admin.json` or `SDKWORK_IAM_SUPER_ADMIN_*` env), writing `.sdkwork.local.env`; the ensure step then prefers the issued real token.
- **ui-env projection** (`packages/client/ui-env`): the host registration passes the launch-environment projection as the settings registration's composition `base` layer — the declared environment slot (`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT`, `test` → `testing`), the first non-empty surface URL (`SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` → `_APP_API_BASE_URL` → `_APPLICATION_PUBLIC_HTTP_URL`), and `SDKWORK_ACCESS_TOKEN`. Settings resolution order (schema defaults → base → user document) keeps a user-edited `ui-env:` section authoritative. The seven SDKWork plugins needed no changes: they already read `env.apiBaseUrl()` and `env.accessToken()`.
- **Workspace wiring**: `@sdkwork/iam-credential-entry` and `@sdkwork/iam-application-bootstrap` joined `pnpm-workspace.yaml` (dependency resolution only, as sibling members); consumers declare them as devDependencies/optionalDependencies (`workspace:^` + published-version fallback), matching the existing ui-iam pattern for private SDKWork packages.

## Alternatives considered

**Browser-side direct `process.env` reads.** Renderer bundles cannot see the host environment; injecting the token into the HTML (`@sdkwork/iam-credential-entry/vite` style) is serve-only and forbidden for builds — the spec's canonical Vite owner exists for Vite-roots, and this product's web shell is host-assembled (`window.__DSH_BOOT__`), so the settings `base` projection is the one channel every surface shares.

**Projecting into the settings document on every startup.** Writing `$DSH_HOME/settings.yaml` would persist generated tokens (rotating 24-hour fixture JWTs), pollute a user-editable file, and race concurrent writers; the composition `base` layer is in-memory, idempotent, and refreshable each launch.

**Always calling the registration API at startup.** Registration is a bootstrap-body super-admin management action (`IAM_APPLICATION_BOOTSTRAP_SPEC.md`): it requires super-admin credentials, must not run from browser runtimes, and cloudrouter never calls it from dev/build — the layered approach (registration as an explicit command, token ensure at startup) is the spec-aligned behavior, with fixture JWTs covering unregistered development.

## Consequences

- Environment switching for local testing is now `cp .env.standalone.test .env` plus a restart: the CLI/desktop ensure step generates the token, and ui-env projects environment, base URL, and token into every SDKWork plugin.
- Published packages degrade gracefully: `@sdkwork/*` is optional, dynamic imports fail to `unavailable`, and the harness falls back to interactive IAM login.
- Costs: test tier needs the explicit `--allow-test-token-generation` switch; an overlay token is reused until deleted (no JWT-expiry refresh — the canonical package owns token validity); `admin:bootstrap:app` needs super-admin credentials and a reachable backend (`SDKWORK_BACKEND_BASE_URL`).

## Testing

Package unit tests cover the ensure ladder (unconfigured / configured / registered / generated-idempotent / test-allowance / production-fail-closed / missing-manifest) in `packages/boot/sdkwork-env-bootstrap/tests`, and the projection (slot mapping, URL priority, empty-field omission, user-layer authority) in `packages/client/ui-env/tests`. The CLI was exercised end to end: development generates the overlay JWT with manifest claims, test without the flag reports the allowance hint, and `admin:bootstrap:app` fails loud without super-admin credentials. Doc gates (translation pairing, budgets, links, note format) verify the bilingual docs.
