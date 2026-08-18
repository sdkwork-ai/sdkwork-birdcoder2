# Agent Note: Unpackaged desktop:dev uses the development API gateway

Status: implemented

English | [中文](2026-08-18-desktop-dev-development-gateway.zh.md)

## Problem

`pnpm desktop:dev` launched Electron with cwd `apps/desktop`. `loadLayeredEnv` reads only that directory's `.env` (it does not walk parents), so the repo-root `.env.standalone.development` never loaded. ui-env then kept its schema default `environment: production` and origin `https://api.birdcoder.com`. The packaged `desktop:dist` build should keep that production origin; source `desktop:dev` should use `https://api-dev.birdcoder.com`.

## Decision

The Electron main passes `sdkworkEnv: app.isPackaged ? 'production' : 'development'` into `bootDesktopHost`. `applySdkworkDesktopLaunchEnv` (`@deepseek-ai/dsh-sdkwork-env-bootstrap`) fills unset SDKWork identity and gateway keys before the layered `.env` load:

- **development** (unpackaged `desktop:dev`): walk up from `apps/desktop` to the repository root (`sdkwork.app.config.json`), apply non-empty keys from `.env.standalone.development`, then fill remaining identity/gateway keys with `https://api-dev.birdcoder.com`. Empty placeholders are skipped so a later project `.env` can still supply secrets. Inherited process env is never replaced.
- **production** (packaged/dist): do not walk; apply `https://api.birdcoder.com` and the production identity keys for unset names only.

Tests omit `sdkworkEnv` so an isolated `cwd` is used as-is. ui-env still projects through the settings `base` layer; a user-edited `ui-env:` section in `$DSH_HOME/settings.yaml` remains authoritative ([env bootstrap and projection](../feature/2026-08-18-sdkwork-env-bootstrap-token-and-projection.md)).

## Alternatives considered

**Change the ui-env schema default to `development`.** Packaged installs have no env file and would then hit `api-dev.birdcoder.com`.

**Make `loadLayeredEnv` walk parent directories.** The loader's launch-scoped discovery is an existing contract ([env-file standard](../process/2026-08-17-sdkwork-env-file-standard.md)); parent search would surprise CLI runs from a nested workspace.

**Require `cp .env.standalone.development .env` before `desktop:dev`.** That is the CLI workflow; `pnpm --filter` changes cwd to `apps/desktop`, so the copy still would not load.

## Consequences

`pnpm desktop:dev` projects `https://api-dev.birdcoder.com` without a repo-root `.env`. Packaged builds keep `https://api.birdcoder.com`. A user who previously saved `ui-env.environment: production` in the settings document still sees production until that section is cleared or set to `development`. Explicit `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` in the launching shell still wins.

## Testing

Package unit tests in `packages/boot/sdkwork-env-bootstrap/tests` pin the nested-cwd walk, the tracked development file (empty placeholders skipped), the packaged production origin without walking, and inherited URL preservation. Doc gates (translation pairing, links, note format) verify the bilingual docs.
