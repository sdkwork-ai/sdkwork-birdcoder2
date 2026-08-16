# Agent Note: Shared deployment environments unify sdkwork plugin configuration

Status: implemented

English | [中文](2026-08-17-shared-deployment-environments.zh.md)

## Problem

Every sdkwork integration plugin owned its own base URL (and friends) in its own settings namespace: ui-iam carried `baseUrl`/`appId`, ui-feedback carried `baseUrl`/`appKey`. A deployment targeting a different environment (development / testing / production) had to edit each plugin's settings separately, and there was no place to configure a static access token for non-interactive API calls. The product asked for one environment configuration (per-environment base URLs, access tokens, app keys) that every plugin consumes.

## Decision

A new plugin package `ui-env` (`@deepseek-ai/dsh-client-ui-env`) owns the shared environment configuration, and both sdkwork plugins read their facts from it:

- **One settings scope, three profiles.** The `ui-env` namespace carries the active `environment` selector (`development` / `testing` / `production`) plus one profile per environment: `apiBaseUrl` (default `https://api.sdkwork.com`), `appId`, `appKey`, and `accessToken` (empty by default). A deployment switches environments by editing one document, and each environment carries its own token.
- **`ctx.env` service.** The browser half provides `EnvService` — the active profile projection (`apiBaseUrl()`, `appId()`, `appKey()`, `accessToken()`, `isConfigured()`) with scope subscription. Every consuming plugin type-imports it (`ctx.get('env')`, never a declared injection).
- **ui-iam migrates.** Its settings namespace drops `baseUrl`/`appId`; the IAM app-api origin and tenant app id come from the active profile. Only presentation/QR/OAuth toggles stay in `ui-iam`. The auth runtime rebuilds lazily on environment moves; session bootstrap now keys off the environment subscription.
- **ui-feedback migrates.** The plugin owns no settings namespace anymore (the host loader is a no-op); the collector base URL and app key come from the profile. Credentials resolve in order: the profile's static `accessToken` when configured (non-interactive deployments), otherwise the mounted IAM session — each submission re-syncs before sending.
- **Unconfigured means disabled.** An empty `apiBaseUrl` in the active profile hides the feedback row and keeps the IAM rail entry off, so pointing at an unconfigured environment disables the sdkwork surfaces without per-plugin edits.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Keep per-plugin base URLs, add an env selector to each | Duplicates the selector and drift between plugins; the whole point is one place |
| A credentials/secret store instead of a plain settings field | The access token is a deployment constant, not a per-user secret; credential-reference is for user credentials |
| Environment profiles nested under each plugin | Same duplication; ui-env is the shared spine |

## Consequences

Deployments configure one `ui-env` document for all sdkwork surfaces; ui-iam and ui-feedback read the same profile, so a switch moves every surface together. Costs: the old `ui-iam.baseUrl`/`ui-feedback.baseUrl` settings stop being read (pre-release policy: update all references together), and the two plugins now depend on ui-env being composed before them (the web bundle orders the rows).

## Testing

The ui-env package specs pin the service (default production profile, environment switch projection, unconfigured detection, subscription) and the host settings registration. ui-iam specs pin env-driven `isConfigured`/`appId` and the env subscription; ui-feedback specs pin env-driven base URL/app key, the env-token-over-session precedence, and the IAM fallback. The settings-menu e2e gains a scenario that boots a dedicated home with a `ui-env` testing profile and asserts the feedback row and dialog still work.
