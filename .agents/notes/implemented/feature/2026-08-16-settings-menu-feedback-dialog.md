# Agent Note: Settings-menu feedback dialog over the appstore feedback collector

Status: implemented

English | [中文](2026-08-16-settings-menu-feedback-dialog.zh.md)

## Problem

The settings menu's 帮助和反馈 row was a placeholder toast (documented limitation of the [settings-menu-popover note](2026-08-16-settings-menu-popover.md)): there was no feedback channel. The product asked for a real feedback flow — clicking 反馈 in the settings menu opens a dialog that submits user feedback to the sdkwork platform, whose API gateway is `api.sdkwork.com`.

## Decision

A new plugin package `ui-feedback` (`@deepseek-ai/dsh-client-ui-feedback`) implements the channel, and the settings menu splits 帮助和反馈 into 帮助 (toast) and 反馈 (dialog) behind a new seam:

- **The feedback seam, account-style.** `ui-settings-menu` provides `ctx.feedback` (`FeedbackRuntime`): a snapshot source (`{ available }`) plus `open()`. The shipped provider is the unavailable state — the row stays hidden and opening no-ops. `ui-feedback` replaces the source through `ctx.feedback.setSource` (the same bind pattern as the ui-iam account seam), so the menu renders one snapshot contract whether or not any channel is mounted; the web bundle decides by composing the plugin.
- **The collector is the existing sdkwork module.** The only feedback implementation in sdkwork-space lives in the appstore: `sdkwork-appstore`'s composed SDK (`@sdkwork/appstore-app-sdk`) exposes `client.catalog.submitFeedback({ type, content, contact?, appKey })` against `POST /app/v3/api/appstore/catalog/feedback`, requiring AuthToken/AccessToken. The plugin imports that SDK and configures it with `baseUrl` (default `https://api.sdkwork.com`) and `appKey` (default `sdkwork-birdcoder`, mirroring the ui-iam app id) from a new `ui-feedback` settings namespace. The appstore SDK joins the harness workspace as a dependency-resolution sibling (`pnpm-workspace.yaml`), like the other sdkwork members.
- **Tokens flow from the mounted IAM session.** The service reads `ctx.get('iam')` (never a declared injection) and keeps the appstore client's token manager in step with the ui-iam controller's session — each submission re-syncs `authToken`/`accessToken`/`refreshToken`. Without a ui-iam mount the client carries no tokens; the collector's 401 surfaces as the dialog's sign-in hint.
- **The dialog is a frame overlay host.** `ui-feedback` registers `shell.overlay` entry `feedback` with its own store (the same host shape as ui-iam's `iam-sign-in`): a type group (问题反馈 / 功能建议 / 其他), required content (≤ 4000 UTF-8 bytes, the collector's limit), optional contact, submit/cancel, success and error states. Unconfigured (empty base URL) it shows the configuration notice, so the gesture always lands in a dialog.
- **SDK type hygiene follows ui-iam.** The emit project resolves `@sdkwork/*` to local declaration facades (`sdkwork-types/`); `tsconfig.tests.json` type-checks the real sdkwork sources and is the drift guard; the tsdown bundle swaps in a path-free tsconfig to inline the real packages.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Add the dialog inside ui-settings-menu | The menu shell would depend on a feature provider and lose the plugin boundary; the seam keeps feature and shell decoupled |
| Hand-roll the POST without the SDK | sdkwork-space's appstore SDK already implements the endpoint contract, auth headers, and error envelope; hand-rolling duplicates owned code |
| Read the IAM session from localStorage directly | Duplicates ui-iam's storage key; the controller state is the owned, typed surface |

## Consequences

The settings menu gains a provider-gated 反馈 row and `ui-feedback` owns the whole feedback surface (settings scope, SDK client, dialog, seam binding). The 帮助和反馈 label splits in two, so the menu golden (`settings-chrome/menu.expected.md`) and the settings-menu e2e update together. Costs: the appstore SDK adds a workspace sibling for dependency resolution only (never a build target), and the browser bundle closure grows by the composed appstore client.

## Testing

The package's specs pin the service (settings mirror, lazy client rebuild, blank/trim validation, token sync from a scriptable IAM controller), the dialog (form render, validation, submit/success/error/401, dismiss), the plugin registrations and seam binding, and the host settings registration. The e2e layer: the settings-menu e2e asserts the 反馈 row and opens/closes the dialog, and the settings-chrome menu golden gains the new row.
