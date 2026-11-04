# Agent Note: The login API-key entry is opt-in

Status: implemented

English | [中文](2026-11-04-login-api-key-entry-opt-in.zh.md)

## Problem

The [unified login surface](2026-11-04-unified-login-surface.md) rendered "Add API Key" next to Sign in on every login entry. That fallback configures the official DeepSeek provider key, while the product's login is the SDKWork account; offering both by default asked every user to choose between two logins and exposed a path the deployment may not support. The desktop welcome window had no way to omit the entry at all.

## Decision

One deployment switch, `brand.showApiKeyEntry` in the OEM profile, defaulting to `false`. It gates the API-key entry on every login surface:

- **Desktop welcome window.** The main process reads the resolved OEM brand and passes the flag into the isolated welcome renderer through the window's additional arguments; the entry page and the failed-sign-in page omit the API-key action when it is off. The key page and its IPC stay implemented, simply unreachable while hidden.
- **SDKWork IAM overlay entry.** The injected face carries `startApiKey` only when the deployment opted in and the desktop shell owns a key page; a plain browser page continues to omit it.
- **Web account dialog.** The dialog omits its API-key action from both the idle entry and the timeout/failure step when the flag is off. The waiting step's cancel action is unrelated and stays.

The page-bootstrap projection already carries the OEM brand, so the browser client reads the same value as the desktop shell through the shared `readOemShowApiKeyEntry()` helper in `ui-primitives`. A deployment that wants the fallback sets `brand.showApiKeyEntry: true` next to its brand name.

## Alternatives considered

**Hide the entry in the desktop welcome window only.** Lost: the same action appears on the IAM overlay and the web account dialog, so the product would still ask the same question on the other login surfaces.

**Make it a per-user desktop setting.** Lost: whether the deployment supports the official API-key path is a deployment fact, not a user preference; the OEM profile already carries display policy and reaches both the desktop shell and the web client.

**Delete the API-key page.** Lost: an opted-in deployment still needs it, and the page owns the only local credential fallback for the official provider.

## Consequences

A fresh profile shows one login action per surface. The desktop welcome window still renders its key page when enabled; the IPC, credential write, and skip behavior are unchanged. An OEM deployment that relies on the API-key path must add `brand.showApiKeyEntry: true` to its profile, otherwise sign-in goes through the configured account gesture only. The web account dialog's API-key editor remains reachable through the settings coordinator where a surface links to it directly.

## Testing

`packages/host/sdkwork-oem/tests/config.spec.ts` pins the default, the per-environment override, and the boolean validation; `plugin.spec.ts` pins the published brand and browser projection. `packages/client/ui-primitives/tests/oem-brand.client.spec.tsx` covers the reader's fallbacks. `apps/desktop/tests/welcome-window.spec.ts` pins the renderer argument, and `welcome-renderer.client.spec.tsx` asserts the entry is absent when disabled and present when enabled. `packages/client/ui-settings-account/tests/sign-in-dialog.client.spec.tsx` covers the hidden default and the enabled action; `account.client.spec.tsx` and `onboarding.client.spec.tsx` run the enabled fallback. `packages/client/ui-sdkwork-iam/tests/sign-in-overlay.client.spec.tsx` keeps the component's `startApiKey` behavior; the injection gate itself is the one-line condition in the plugin's overlay registration.
