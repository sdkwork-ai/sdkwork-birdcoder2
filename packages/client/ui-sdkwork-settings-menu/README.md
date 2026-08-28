---
description: "Settings menu over the mode rail's settings gear plus the settings modal shell it owns, re-declaring every upstream settings seat so feature-owned sections mount unchanged."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-settings-menu

English | [中文](README.zh.md)

## Summary


The settings menu over the mode rail's settings gear plus the settings modal shell it owns. The plugin occupies the `mode.rail.settings` seat that upstream's `ui-settings-general` used to hold; the web bundle patch disables that upstream row at the composition level (its source is never touched, so upstream updates cannot conflict with this surface) and this package re-declares every settings seat — `settings.trigger/header/action/close/section/onboarding/general.item` — so feature-owned sections, rows, and onboarding steps mount unchanged.

Hovering (or focusing, or clicking) the gear opens the popover menu to its right: a header row with the account identity, the membership/points group when the account provider publishes facts, the feature group (设置 opens the modal, 外观 switches the real theme through the Appearance submenu, 帮助 shows a placeholder toast, 反馈 opens the feedback dialog through the feedback seam, 检查更新 drives the desktop updater where the preload surface exists), and a pinned sign-out footer row that is disabled while signed out. The menu closes on pointer-leave grace, Escape, outside click, and row selection.

The plugin provides `ctx.account` — a snapshot source (`{ signedIn, username?, membership?, points? }`) plus `logout()` — and `ctx.feedback` — a snapshot source (`{ available }`) plus `open()`. The shipped account provider is the anonymous state: no account identity header (the header and the sign-in row are mutually exclusive), membership/points stay hidden, and sign-out is disabled. A future account backend replaces the provider behind the same face; the menu never changes. The shipped feedback provider is the unavailable state: the 反馈 row stays hidden and opening no-ops. The ui-sdkwork-feedback plugin replaces that source behind the same face, so the row appears and opens its dialog only when a feedback channel is mounted.

The settings modal is the package's own shell: the section nav over the `settings.section` ledger, the General section over `settings.general.item`, the loopback open-document action, and the onboarding coordinator over `settings.onboarding`. The `ui-onboarding` settings namespace (welcome-notice acknowledgement) is registered by the host half with the same id as the shell it replaces, so persisted acknowledgements survive the swap.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only settings chrome and navigation. The Appearance submenu calls `ctx.theme.setTheme`, which persists the preference through the settings transport and never touches a model request; the account provider is anonymous by default.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Anonymous account default** — no account identity header (the header and the sign-in row are mutually exclusive), membership/points rows are hidden, and sign-out is disabled until a real account provider replaces `ctx.account`.
- **Help placeholder** — the row shows a "coming soon" toast; no help center exists yet.
- **Feedback row is provider-gated** — the row renders only while the feedback seam's source reports `available` (the ui-sdkwork-feedback plugin over its configured base URL); without it the row stays hidden.
- **Check for updates is desktop-only** — the row renders only where `window.desktopBridge.updates` exists; the web composition hides it.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This package re-declares every settings seat (`settings.trigger/header/action/close/section/onboarding/general.item`) so feature-owned sections mount unchanged; a new seat must mirror upstream's vocabulary or existing consumers stop mounting. `ctx.account` and `ctx.feedback` ship anonymous and unavailable providers behind stable faces — consumers must cope with both states rather than assuming a real backend, and the host half registers `ui-onboarding` under the replaced shell's id so persisted acknowledgements survive.

</details>
