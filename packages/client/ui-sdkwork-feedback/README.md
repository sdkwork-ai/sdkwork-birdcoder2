---
description: "SDKWork feedback integration plugin: the settings-menu feedback dialog submitting user feedback to the appstore feedback collector through the @sdkwork/appstore-app-sdk composed client."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-feedback

English | [中文](README.zh.md)

## Summary


SDKWork feedback integration plugin: the settings-menu feedback dialog submitting user feedback to the appstore feedback collector (`POST /app/v3/api/appstore/catalog/feedback` over the configured base URL, default `https://api.birdcoder.com`) through the `@sdkwork/appstore-app-sdk` composed client, mounted as a frame overlay dialog host.

## Table of Contents

- [Surface](#surface)
- [Configuration](#configuration)
- [Auth](#auth)
- [Implementation notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Surface

The plugin contributes one dialog host plus one service seam:

- **The feedback dialog** (`shell.overlay` entry `feedback`): the settings-menu feedback row's gesture opens a form dialog — feedback type (问题反馈 / 功能建议 / 其他), required content (≤ 4000 UTF-8 bytes, matching the collector's limit), optional contact, and submit/cancel. Submitting sends the draft through the service; success replaces the form with a thank-you state, transport failure shows the retry message, and a 401 response tells the user to sign in first. Unconfigured (empty base URL) the dialog shows the configuration notice instead of the form.
- **The settings-menu feedback seam**: the plugin replaces the menu's unavailable feedback source through `ctx.feedback.setSource` — `available` follows the `ui-sdkwork-feedback` settings scope (the 反馈 row appears once a base URL is configured) and `open` dispatches through the bound dialog actions.

## Configuration

The collector base URL and app key come from the shared [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile: the active environment's `apiBaseUrl` is the appstore app-api origin the feedback client posts to (empty hides the 反馈 row and the dialog shows the configuration notice) and `appKey` is reported with every submission. The plugin owns no settings namespace of its own.

## Auth

The service builds the appstore client lazily from the environment profile (an environment switch rebuilds it without reload). Credentials resolve in order: the profile's static `accessToken` when configured (non-interactive deployments), otherwise the mounted ui-sdkwork-iam controller's session (`ctx.get('iam')`, never a declared injection) — each submission re-syncs the current `authToken`/`accessToken`/`refreshToken` before sending. Without either the client carries no tokens; an anonymous submission still reaches the collector's auth wall and surfaces its 401 as the sign-in hint. Feedback itself is human-only: it never enters the Session log, model context, or telemetry.

## Implementation notes

- The collector face is `client.catalog.submitFeedback({ type, content, contact?, appKey })` from the composed `@sdkwork/appstore-app-sdk` facade (`createAppStoreClient({ baseUrl, tokenManager })`).
- The package's tsc emit resolves `@sdkwork/*` to local declaration facades (`sdkwork-types/`) — the sdkwork source cannot be emitted portably into `lib/types`; the full typecheck against the real packages runs in `tsconfig.tests.json` (wired into `typecheck:contracts-ready`), which is the drift guard for the facades. The tsdown client bundle swaps in a path-free tsconfig so the bundle inlines the real packages. The published package uses the corrected public `@sdkwork/appstore-app-sdk@0.1.1` optional dependency.
- The appstore SDK joins the workspace for dependency resolution only (`pnpm-workspace.yaml`), like the other sdkwork siblings; tsdown's explicit globs never build it.

## Model Experience

None, as the feedback dialog is browser-side SDKWork feedback UI and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Feedback is gated on the settings-menu seam** — the 反馈 row renders only while the ui-sdkwork-settings-menu plugin mounts the feedback seam; a composition without it has no entry point.
- **Signed-out submissions fail with a 401** — the dialog tells the user to sign in; there is no anonymous feedback path or guest identity flow.
- **No uploads** — the form carries text and contact only; attachments would need a media endpoint the collector does not expose here.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package's tsc emit resolves `@sdkwork/*` to local declaration facades in `sdkwork-types/`; the full typecheck against the real packages runs in `tsconfig.tests.json` (wired into `typecheck:contracts-ready`) and is the drift guard for the facades, so run it after touching the SDK surface. Feedback is gated on the settings-menu seam: a composition without ui-sdkwork-settings-menu mounting the feedback source has no entry point at all.

</details>
