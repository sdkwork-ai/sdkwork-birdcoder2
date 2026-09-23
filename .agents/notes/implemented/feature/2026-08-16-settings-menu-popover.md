# Agent Note: Settings menu popover replaces the direct settings dialog trigger

Status: implemented

English | [中文](2026-08-16-settings-menu-popover.zh.md)

## Problem

The mode rail's settings gear (the `mode.rail.settings` seat, see the [settings-rail-seat note](2026-08-16-settings-rail-seat.md)) opened the settings modal directly on click. The product asked for a hover popover menu on the gear instead: an account header with the username, a membership/points group, a feature group (Settings → the existing modal, Appearance → light/dark/follow-system, Help & Feedback, Check for updates), and a pinned sign-out footer — every row with a leading icon. The fork must not modify the upstream plugin source, so synchronized upstream updates cannot conflict with this surface.

## Decision

A new plugin package `ui-sdkwork-settings-menu` (`@deepseek-ai/dsh-client-ui-sdkwork-settings-menu`) takes over the settings surface, and the composition overrides the upstream shell at the config level (the lever it uses is amended in [Update (2026-09-23)](#update-2026-09-23-upstream-made-the-settings-namespace-the-row-id) below):

- **Config override, not source change.** The web bundle patch (`packages/bundle/web-app/cordis.patch.yml`) sets the `ui-settings-general` row to `disabled: true` and inserts `ui-sdkwork-settings-menu`. *(Amended 2026-09-23: that row keeps upstream's id and is repointed at this package instead — see the [Update](#update-2026-09-23-upstream-made-the-settings-namespace-the-row-id).)* The upstream package's source stays untouched; when upstream updates it, only the patch row (targeted by id) and the new package matter. The desktop composition inherits the web roster, so the menu ships there too with no extra row.
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

The settings surface is fully owned by the fork's package: upstream changes to ui-settings-general are irrelevant while its row stays repointed at this package, and the only shared contract is the ui-settings slot types. Costs: the modal shell (~250 lines), chrome content, General section, and document action are duplicated from the upstream package's design; two bundles (web/desktop) inherit the new roster through the single web-app patch row.

## Testing

The package's apply spec pins the seat fill, the account service, the theme mirror, and teardown; the component spec drives the menu rows, the appearance submenu selection, the dialog close paths, and the onboarding coordinator. The e2e layer: settings-chrome flows open the dialog through the menu (shared `openSettingsDialog` helper), its golden set gains the menu snapshot, and a new settings-menu e2e covers hover-open/close, the real theme cascade from the submenu, the help toast, and the web-hidden update row.

## Update (2026-09-23): upstream made the settings namespace the row id

Upstream's [profile-owned live configuration](../architecture/2026-09-19-profile-owned-live-configuration.md) change (PR #4587, 2026-09-21) recast a profile-backed settings namespace from an explicitly registered name into **the Cordis loader entry's own `id`**: a namespace exists only while a live row of that id declares the field with `.volatile()`, and the Host resolves `settings.mutate(ns, …)` as `configEditor.entries().find(row => row.options.id === ns)`, rejecting every other namespace with `No configurable plugin entry "<ns>"`.

The strategy above does not survive that contract. Disabling the `ui-settings-general` row and mounting this package on its own `ui-sdkwork-settings-menu` id left every namespace this package re-declares without a live entry of that id, and the first casualty was the welcome notice: its only dismissal is a *successful* write of `welcomeNoticeVersion` into `ui-settings-general` (Escape and mask clicks are deliberate no-ops), so the rejected write stranded the user in the notice behind 「暂时无法保存确认状态，请重试。」 with no way forward.

The row therefore keeps upstream's id and is repointed at this package — the shape upstream's own `directory-picker` row already uses:

```yaml
- id: ui-settings-general
  name: '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu'
```

A later patch row replaces the earlier row of the same id wholesale, so the upstream plugin still never loads: none of the "config override, not source change" rationale above is lost, only the choice of lever. Both compositions are covered by the single web-app patch row, and the desktop bundle inherits the Web roster unchanged, so the renames are still one-row work per merge.

`packages/bundle/sdkwork-desktop-app/tests/composition-parity.spec.ts` now guards the pair: it reads the reader's namespace constant out of `ui-settings-models`' `onboarding-copy.ts` and asserts that, in both the Web and the desktop composition, a row of exactly that id is present, is not disabled, and names this package — while a fork-only `ui-sdkwork-settings-menu` row id stays absent.
