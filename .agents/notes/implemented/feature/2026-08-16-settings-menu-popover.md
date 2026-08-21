# Agent Note: Settings menu popover replaces the direct settings dialog trigger

Status: implemented

English | [中文](2026-08-16-settings-menu-popover.zh.md)

## Problem

The mode rail's settings gear (the `mode.rail.settings` seat, see the [settings-rail-seat note](2026-08-16-settings-rail-seat.md)) opened the settings modal directly on click. The product asked for a hover popover menu on the gear instead: an account header with the username, a membership/points group, a feature group (Settings → the existing modal, Appearance → light/dark/follow-system, Help & Feedback, Check for updates), and a pinned sign-out footer — every row with a leading icon. The fork must not modify the upstream plugin source, so synchronized upstream updates cannot conflict with this surface.

## Decision

A new plugin package `ui-sdkwork-settings-menu` (`@deepseek-ai/dsh-client-ui-sdkwork-settings-menu`) takes over the settings surface, and the composition disables the upstream shell at the config level:

- **Config override, not source change.** The web bundle patch (`packages/bundle/web-app/cordis.patch.yml`) sets the `ui-settings-general` row to `disabled: true` and inserts `ui-sdkwork-settings-menu`. The upstream package's source stays untouched; when upstream updates it, only the patch row (disabled by id) and the new package matter. The desktop composition inherits the web roster, so the menu ships there too with no extra row.
- **The new plugin declares every settings seat.** `ui-sdkwork-settings-menu` occupies `mode.rail.settings` and re-declares `settings.trigger/header/action/close/section/onboarding/general.item` with the same names and specs as the shell it replaces. Feature-owned registrants (ui-theme's Appearance row, ui-settings-models, plugin inventory, onboarding steps, the loopback document action) mount unchanged through `slots.inject` on the new declarations. The settings slot types stay in ui-settings.
- **The hover menu.** The seat component renders the trigger (the `settings.trigger` slot content) wrapped in the shared `Menu` primitive — `side: right`, portaled, `closeOnPointerLeave` — opened on hover, focus, and click; closed on pointer-leave grace, Escape, outside click, and row selection. The `Menu` primitive gains a `header` slot (the footer's mirror) for the pinned account row and selection markers on submenu rows (the Appearance check). Three new icons join ui-primitives: `IconLogoutOutline14`, `IconCrownOutline16`, `IconCoinOutline16`.
- **The account seam.** The plugin provides `ctx.account` (`AccountRuntime`): a snapshot source (`{ signedIn, username?, membership?, points? }`) plus `logout()`. The shipped provider is the anonymous state — the header shows 未登录, membership/points rows are hidden, sign-out is disabled. A future account backend replaces the provider behind the same face; the menu never changes.
- **Row behavior.** 设置 opens the modal (same component owns menu and panel, so the dialog open state is local as before). 外观 is a submenu over `ctx.theme.setTheme`, its selection mirrored from `theme/change` through a registrant-private observable. 帮助和反馈 shows a placeholder toast (no help center or feedback channel exists). 检查更新 calls `window.desktopBridge.updates.check()` and only renders where the preload surface exists (web compositions hide it). 退出登录 is a danger footer row, disabled while signed out.
- **The settings modal shell is reimplemented, not imported.** The panel, section nav projection, onboarding coordinator, chrome content, General section, and the loopback open-document action are the new package's own equivalents (cross-package value imports are forbidden; the original's files are small).

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Edit ui-settings-general's source in place | Contradicts the sync-independence requirement; upstream updates would conflict |
| Dynamic slot shadowing of the seat (register at lower priority) | The shadowed occupant's dialog and child declarations die with it, and the behavior depends on the upstream plugin's internals — the opposite of independence |
| Reuse the original package's dialog via the slot system | The children-declaration rule forbids rendering slots another entry declared; only same-name re-declaration keeps registrants working |

## Consequences

The settings surface is fully owned by the fork's package: upstream changes to ui-settings-general are irrelevant while its row stays disabled, and the only shared contract is the ui-settings slot types. Costs: the modal shell (~250 lines), chrome content, General section, and document action are duplicated from the upstream package's design; two bundles (web/desktop) inherit the new roster through the single web-app patch row.

## Testing

The package's apply spec pins the seat fill, the account service, the theme mirror, and teardown; the component spec drives the menu rows, the appearance submenu selection, the dialog close paths, and the onboarding coordinator. The e2e layer: settings-chrome flows open the dialog through the menu (shared `openSettingsDialog` helper), its golden set gains the menu snapshot, and a new settings-menu e2e covers hover-open/close, the real theme cascade from the submenu, the help toast, and the web-hidden update row.
