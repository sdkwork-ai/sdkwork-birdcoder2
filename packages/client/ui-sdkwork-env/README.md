---
description: "SDKWork deployment environment plugin: the shared ui-sdkwork-env settings scope (active environment plus one profile per environment) exposed as the ctx.env service."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-env

English | [中文](README.zh.md)

## Summary


SDKWork deployment environment plugin: the shared `ui-sdkwork-env` settings scope (active environment plus one profile per environment) exposed as the `ctx.env` service. Every sdkwork integration plugin (ui-sdkwork-iam, ui-sdkwork-feedback, ui-sdkwork-appstore, and future ones) reads its deployment values from this one service, so a deployment switches environments in one place instead of per-plugin settings.

## Table of Contents

- [Configuration](#configuration)
- [Consumers](#consumers)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Configuration

The `ui-sdkwork-env` settings namespace (host-side registration in this package's node half, exposed to the browser through the api-proxy's product namespace list) carries:

| Field | Default | Meaning |
|---|---|---|
| `environment` | `production` | The active environment; its profile feeds every sdkwork integration |
| `development` | profile below | Development profile (API gateway origin, app id, app key, access token) |
| `testing` | profile below | Testing/staging profile |
| `production` | profile below | Production profile |

Each profile defaults to the product gateway origin (`http://api-dev.birdcoder.com` for development, `https://api-test.birdcoder.com` for testing, `https://api.birdcoder.com` for production), the same tier domain as `imApiBaseUrl`, `appId: sdkwork-birdcoder`, `appKey: sdkwork-birdcoder`, an empty `accessToken`, and an empty `imEmbedUrl`. A deployment overrides the profile fields it needs; `imEmbedUrl` takes an absolute HTTP(S) URL or a root-relative path served by the deployment origin (the script runs with the page's privileges, so only trusted deployment URLs are accepted):

```yaml
ui-sdkwork-env:
  environment: testing
  development:
    apiBaseUrl: http://api-dev.birdcoder.com
    appKey: sdkwork-birdcoder-dev
  testing:
    apiBaseUrl: https://api-test.birdcoder.com
    appKey: sdkwork-birdcoder-test
    accessToken: <staging access token>
  production:
    apiBaseUrl: https://api.birdcoder.com
    appKey: sdkwork-birdcoder
```

### Launch-environment projection

The host registration projects the launch environment into the namespace's composition `base` layer, so the SDKWork env files drive the browser SDK configuration without a settings-document edit. When the launch environment declares an SDKWork profile (`SDKWORK_PROFILE_ID` or `SDKWORK_BIRDCODER_ENVIRONMENT`/`SDKWORK_ENVIRONMENT`), the registration sets `environment` to the declared tier (`development`, `test`/`staging` → `testing`, `production`); the active profile's `apiBaseUrl` from the first non-empty `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` / `SDKWORK_BIRDCODER_APP_API_BASE_URL` / `SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL`; and the active profile's `accessToken` from `SDKWORK_ACCESS_TOKEN` (the startup ensure step in `@deepseek-ai/dsh-sdkwork-env-bootstrap` materializes a generated token into the process environment), `imApiBaseUrl` from `SDKWORK_IM_API_BASE_URL` / `SDKWORK_BIRDCODER_IM_API_BASE_URL`, and `imEmbedUrl` from `SDKWORK_IM_EMBED_URL` / `SDKWORK_BIRDCODER_IM_EMBED_URL`. In a source checkout the launcher first honors the copied repo-root `.env`, then fills any missing SDKWork keys from the tracked `.env.standalone.<environment>` materialization, so `pnpm dsh web`, `pnpm desktop:dev`, and direct Vite builds stay on the same lifecycle slot. Resolution order is schema defaults, then this base layer, then the user settings document — a user-edited `ui-sdkwork-env:` section always wins, so the env files are the deployment default rather than an override.

## Consumers

- **ui-sdkwork-iam** reads the active profile's `apiBaseUrl` as the IAM app-api origin and `appId` as the tenant application id; its own settings section keeps only presentation and login toggles.
- **ui-sdkwork-feedback** reads `apiBaseUrl` as the collector origin and `appKey` for submissions. Its submissions use the profile's `accessToken` when configured (non-interactive deployments); otherwise they fall back to the mounted IAM session's tokens.
- **ui-sdkwork-appstore** reads `apiBaseUrl` as the catalog origin and gives the profile's `accessToken` precedence over the mounted IAM session's tokens.
- **ui-sdkwork-im** reads `imEmbedUrl` as the SDKWork IM embed bundle it loads once per page, and `imApiBaseUrl` (falling back to `apiBaseUrl`) as the IM gateway origin it hands to that bundle. The IM SDK appends `/im/v3/api` and derives the realtime origin from it, so each tier talks to its own domain.

An empty `apiBaseUrl` in the active profile means "unconfigured": the feedback row hides, the IAM rail entry stays off, and App Store renders its configuration notice, so switching to an unconfigured environment disables the sdkwork surfaces without touching per-plugin settings. An empty `imEmbedUrl` likewise leaves the chat and contacts pages with an unavailable notice instead of mounting a bundle that does not exist. An empty `imApiBaseUrl` reuses `apiBaseUrl`; a non-empty one lets a deployment move IM to another host without touching IAM or the API gateway.

### Desktop shell

Under the Electron shell (`dsh-app://app`), `apiBaseUrl()` and `imApiBaseUrl()` return the same profile gateway a browser page uses: the SDK clients append their own `/app/v3/api`, `/backend/v3/api`, and `/im/v3/api` paths, and `dsh-app://app` is a registered first-party CORS origin, so the gateway answers the shell's preflight like any browser page's. Each environment therefore keeps its own domain (or the loopback address a source launch selected), and the IM embed bundle derives its realtime origin from the gateway base it receives.

The plugin also publishes the active profile to the SDKWork browser runtime bridge (`globalThis.SDKWORK_RUNTIME_ENV`: `SDKWORK_API_BASE_URL`, `SDKWORK_IM_API_BASE_URL`, `SDKWORK_ENVIRONMENT`) and updates it on environment switches, so shared SDK resolvers reach the active gateway instead of the base URL the SDK was published with.

## Model Experience

None, as the environment service is pure settings chrome and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Access tokens are shared per environment** — the profile carries one static token for all API clients; per-consumer credentials would need a credential-reference integration.
- **Environment switching is a settings document edit** — there is no in-app environment picker; switching applies on the next scope move without a reload.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Resolution order is schema defaults, then the launch-environment `base` layer, then the user settings document — a user-edited `ui-sdkwork-env:` section always wins, so the env files are the deployment default rather than an override. Every sdkwork integration plugin reads deployment values from this one `ctx.env` service; adding a consumer means extending the profile semantics here, not minting another settings namespace.

</details>

## Runtime invariants

No runtime invariant companion is published; the environment service is a pure settings mirror — every consuming plugin reads the active profile through the same service face, and profile agreement is covered directly by this package client behavior specs.
