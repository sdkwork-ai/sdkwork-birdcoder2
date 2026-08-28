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

Each profile defaults to the product gateway origin (`http://api-dev.birdcoder.com` for development, `https://api-test.birdcoder.com` for testing, `https://api.birdcoder.com` for production), `appId: sdkwork-birdcoder`, `appKey: sdkwork-birdcoder`, and an empty `accessToken`. A deployment overrides the profile fields it needs:

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

The host registration projects the launch environment into the namespace's composition `base` layer, so the SDKWork env files drive the browser SDK configuration without a settings-document edit. When the launch environment declares an SDKWork profile (`SDKWORK_PROFILE_ID` or `SDKWORK_BIRDCODER_ENVIRONMENT`/`SDKWORK_ENVIRONMENT`), the registration sets `environment` to the declared tier (`development`, `test`/`staging` → `testing`, `production`); the active profile's `apiBaseUrl` from the first non-empty `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` / `SDKWORK_BIRDCODER_APP_API_BASE_URL` / `SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL`; and the active profile's `accessToken` from `SDKWORK_ACCESS_TOKEN` (the startup ensure step in `@deepseek-ai/dsh-sdkwork-env-bootstrap` materializes a generated token into the process environment). In a source checkout the launcher first honors the copied repo-root `.env`, then fills any missing SDKWork keys from the tracked `.env.standalone.<environment>` materialization, so `pnpm dsh web`, `pnpm desktop:dev`, and direct Vite builds stay on the same lifecycle slot. Resolution order is schema defaults, then this base layer, then the user settings document — a user-edited `ui-sdkwork-env:` section always wins, so the env files are the deployment default rather than an override.

## Consumers

- **ui-sdkwork-iam** reads the active profile's `apiBaseUrl` as the IAM app-api origin and `appId` as the tenant application id; its own settings section keeps only presentation and login toggles.
- **ui-sdkwork-feedback** reads `apiBaseUrl` as the collector origin and `appKey` for submissions. Its submissions use the profile's `accessToken` when configured (non-interactive deployments); otherwise they fall back to the mounted IAM session's tokens.
- **ui-sdkwork-appstore** reads `apiBaseUrl` as the catalog origin and gives the profile's `accessToken` precedence over the mounted IAM session's tokens.

An empty `apiBaseUrl` in the active profile means "unconfigured": the feedback row hides, the IAM rail entry stays off, and App Store renders its configuration notice, so switching to an unconfigured environment disables the sdkwork surfaces without touching per-plugin settings.

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
