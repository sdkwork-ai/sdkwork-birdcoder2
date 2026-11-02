# Agent Note: SDKWork configuration comes from Vite env files

Status: implemented

English | [中文](2026-11-02-vite-env-configuration.zh.md)

## Problem

The packaged Desktop application could not reach the SDKWork gateway on a machine that had no bootstrap credential: the client learned its deployment, gateway, and `SDKWORK_ACCESS_TOKEN` from a `resources/sdkwork-release.env` artifact that packaging generated, the shell handed to the Host, and the Host projected into the page as `__DSH_SDKWORK_ENV__`. That chain had three costs the fork kept paying: the artifact had to be produced by a packaging-only step (`prepare:sdkwork-env`) with a distribution class (`DSH_DESKTOP_DISTRIBUTION`) that decided whether a credential was allowed at all; the projection was a second configuration path that could disagree with the checked-in env files; and the GitHub lane could not use the repository's own committed env file, so it shipped `public` artifacts that could not dispatch an IAM credential-entry request.

## Decision

### The committed env file is the only environment source

`apps/web/vite.config.ts` reads `.env` and `.env.<deployment-profile>.<environment>` with Vite's `loadEnv`, maps the SDKWork keys through `projectSdkworkEnvBase`, and injects the resulting `__DSH_SDKWORK_ENV__` object into the built HTML. `DSH_WEB_DEPLOYMENT_PROFILE` chooses `cloud` (the default) or `standalone`, and the build mode chooses `development|test|staging|production` (`--mode`, or `DSH_WEB_BUILD_MODE` for the lanes that drive the build themselves); every committed env file may carry its deployment's `SDKWORK_ACCESS_TOKEN`. The launching process's own `SDKWORK_*` values are removed before the load, so a packaged Desktop application started from an integrated shell cannot decide what a source build bakes; a launcher that resolved a value itself (`desktop:dev --gateway`) passes it through the explicit `DSH_WEB_SDKWORK_*` channel.

### Cloud is the default, and it is reached by domain

The cloud profile follows `etc/topology/cloud.<environment>.env`: the platform API gateway and the IM gateway are the SDKWork cloud edge (`https://api.sdkwork.com` in production, `api-<tier>.sdkwork.com` elsewhere), and the application public ingress is `https://harness<suffix>.sdkwork.com`. `.env.cloud.production` carries the same bootstrap credential as `.env.standalone.production`, so the packaged application authenticates against the cloud deployment. A non-development build drops any loopback origin from the surface keys, which keeps a packaging host's local `.env` from baking `127.0.0.1` into an artifact that must reach a deployment domain.

### The page is the only carrier

The Host publishes nothing: `packages/client/ui-sdkwork-env` keeps the settings section and its schema, and the browser merges the injected page global with the user settings document. The user document still wins field by field, so a deployment can be overridden without rebuilding, but there is no runtime projection, no launch-environment snapshot dependency, and no second source that could name another gateway.

### Packaging carries no SDKWork step

`package-target.ts` no longer runs `prepare:sdkwork-env`, no longer asserts a distribution class, and no longer ships `resources/sdkwork-release.env` or `resources/sdkwork-app.json`. The Web build that packaging already runs (`vite build`, production mode) bakes the committed env file into the page, so the artifact is self-contained without a packaging-time credential decision. The distribution-class gate, the release-environment artifact, the application-identity resource, and their shell/Host plumbing are deleted.

### One build per environment

A build now targets exactly one deployment and environment. `pnpm --filter @deepseek-ai/dsh-web-frontend run build:test` / `build:staging` / `build:production` select the environment, `dev:web`'s watcher builds `development`, and the GitHub release lane builds `production`, which loads `.env.cloud.production` by default. Switching an installed application between environments means installing the matching build; a runtime switch was the projection's job and is gone by design.

### Refreshing a credential is a commit

The reachable `SDKWORK_ACCESS_TOKEN` lives in the tracked `.env.cloud.production` (and its standalone twin, see both file headers). `pnpm env:token:ensure --environment production` materializes a value into the user-private bundle; copying it into the tracked file, committing it, and re-running the lane refreshes what every future build bakes. `pnpm env:token:resolve` still validates the tracked value before the build so a stale or absent token fails early with its repair command.

## Alternatives considered

**Keep the runtime projection.** It let one build serve several environments and a machine-local credential, and it is what made the installed application fail wherever that machine state was absent. The page already cannot read env files at runtime, so every deployment eventually needed the projection to agree with the committed files; two sources, one failure mode.

**Keep the deployment artifact but let it override the baked values.** Two sources again, and the packaged artifact would silently disagree with the env file a developer reviewed. Deleting the artifact makes the diff that refreshes the credential the only place the value changes.

**Require a repository secret for the GitHub lane.** The lane would produce an artifact whose configuration no file records, and a local build would still need a different mechanism. The committed env file is inspectable in the same diff that refreshes it.

**Keep one universal build and fetch configuration at startup.** That is the projection under another name and keeps the IAM credential-entry failure the same: no token before the first request.

## Consequences

Every artifact names one deployment and authenticates without any machine-local setup. The credential is part of the built page, so its exposure equals the committed env file's, and rotating it means revoking the token, refreshing the tracked value, committing, and rebuilding. The `ui-sdkwork-env` settings document remains for local overrides, but an installation can no longer change environments without installing another build. `dev:web` now bakes the development env file, so a developer who needs a bootstrap token in development puts it in `.env` (gitignored) or in `.env.standalone.development`.

## Verification

`pnpm exec vitest run packages/client/ui-sdkwork-env/tests apps/desktop/tests/package-target-stages.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts` covers the settings section, the Host's refusal to publish a launch-environment projection, and the packaging stage list with no SDKWork step. `pnpm --filter @deepseek-ai/dsh-web-frontend run build` writes `dist/index.html` whose `__DSH_SDKWORK_ENV__` carries `environment: production`, `apiBaseUrl: https://api.sdkwork.com`, `imApiBaseUrl: https://api.sdkwork.com`, and the committed token, with no loopback surface origin; `DSH_WEB_DEPLOYMENT_PROFILE=standalone` builds the same page against `https://api.birdcoder.com`, and `DSH_WEB_BUILD_MODE=development` bakes the cloud development edge `https://api-dev.sdkwork.com`; the packaged application's `resources/` contains neither `sdkwork-release.env` nor `sdkwork-app.json`.
