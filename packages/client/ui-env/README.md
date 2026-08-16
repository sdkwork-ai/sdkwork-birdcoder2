# @deepseek-ai/dsh-client-ui-env

English | [中文](README.zh.md)

SDKWork deployment environment plugin: the shared `ui-env` settings scope (active environment plus one profile per environment) exposed as the `ctx.env` service. Every sdkwork integration plugin (ui-iam, ui-feedback, and future ones) reads its base URL, app id, app key, and static access token from this one service — a deployment switches environments in one place instead of per-plugin settings.

## Configuration

The `ui-env` settings namespace (host-side registration in this package's node half, exposed to the browser through the api-proxy's product namespace list) carries:

| Field | Default | Meaning |
|---|---|---|
| `environment` | `production` | The active environment; its profile feeds every sdkwork integration |
| `development` | profile below | Development profile (API gateway origin, app id, app key, access token) |
| `testing` | profile below | Testing/staging profile |
| `production` | profile below | Production profile |

Each profile defaults to `apiBaseUrl: https://api.sdkwork.com`, `appId: sdkwork-birdcoder`, `appKey: sdkwork-birdcoder`, and an empty `accessToken`. A deployment overrides the profile fields it needs:

```yaml
ui-env:
  environment: testing
  development:
    apiBaseUrl: https://api.dev.sdkwork.com
    appKey: sdkwork-birdcoder-dev
  testing:
    apiBaseUrl: https://api.staging.sdkwork.com
    appKey: sdkwork-birdcoder-test
    accessToken: <staging access token>
  production:
    apiBaseUrl: https://api.sdkwork.com
    appKey: sdkwork-birdcoder
```

## Consumers

- **ui-iam** reads the active profile's `apiBaseUrl` as the IAM app-api origin and `appId` as the tenant application id; its own settings section keeps only presentation and login toggles.
- **ui-feedback** reads `apiBaseUrl` as the collector origin and `appKey` for submissions. Its submissions use the profile's `accessToken` when configured (non-interactive deployments); otherwise they fall back to the mounted IAM session's tokens.

An empty `apiBaseUrl` in the active profile means "unconfigured": the feedback row hides and the IAM rail entry stays off, so switching to an unconfigured environment disables the sdkwork surfaces without touching per-plugin settings.

## Model Experience

None. The environment service is pure settings chrome; nothing here reaches a model request.

## Known Limitations and Deferred Work

- **Access tokens are shared per environment** — the profile carries one static token for all API clients; per-consumer credentials would need a credential-reference integration.
- **Environment switching is a settings document edit** — there is no in-app environment picker; switching applies on the next scope move without a reload.
