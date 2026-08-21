# Agent Note: Settings moves to the mode rail's bottom seat

Status: implemented

English | [中文](2026-08-16-settings-rail-seat.zh.md)

## Problem

The settings trigger row sat at the bottom of the sidebar (workspace/session column) foot. The WeChat-desktop-style shell was asked to move it: remove the bottom-of-workspace settings row and pin the settings gear to the bottom of the mode rail (the leftmost icon track), where it stays reachable in every sidebar state.

## Decision

The settings shell (ui-settings-general's trigger + modal panel) moves from the `sidebar.settings` seat to a new `mode.rail.settings` seat, and the mode rail gains a bottom-pinned settings cell:

- **The rail declares and renders the seat.** ui-sdkwork-app-modes declares `mode.rail.settings` (single, root scope; empty owner share — the rail passes no facts, the seat is always the compact rail form) and renders it below the entries' flex spacer. The seat sits outside the entries `role="group"` (the group is now an inner wrapper), so the settings button is not announced as an app mode. ui-settings-general registers `SettingsRoot` into the seat instead of `sidebar.settings`; its trigger/header/action/close/section/onboarding child seats are unchanged.
- **The trigger is always the rail form.** The sidebar-era `wide` fact is gone: `SettingsTriggerOwnerProps` (ui-settings) and the shell's own owner share drop `wide`, the trigger renders at the rail's 44px icon-cell geometry, and `TriggerContent` renders the gear with a visually-hidden label — the accessible name now always resolves from slot content (the collapsed-sidebar trigger previously lost its name in rail state).
- **The sidebar foot loses the settings seat.** ui-sidebar drops the `sidebar.settings` slot declaration, its children registration, and the `.settingsArea` chrome; the foot keeps only `sidebar.footer.action` (ui-cordis' dynamic-plugin panel). ui-settings-general's type-only dependency moves from ui-sidebar to ui-sdkwork-app-modes.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Keep the trigger in the sidebar and only restyle it | The request names the mode rail as the destination, and the sidebar foot loses its only non-cordis occupant |
| Direct component import into ModeRail | A hard ui-sdkwork-app-modes → ui-settings-general dependency breaks the "shells declare seats, features occupy them" pattern and the register-time composition |
| Render the seat inside the entries group | The settings button would be announced as an app mode and counted by the rail's group-scoped queries |

## Consequences

The settings gear is pinned at the bottom of the mode rail in every state — expanded sidebar, collapsed rail, and sidebar hidden via the visibility preference. The sidebar foot now renders only the cordis footer panel. Costs: one more slot on the rail ledger; the trigger lost its wide labeled form (the gear is icon-only everywhere); the sidebar collapse animation no longer crossfades a settings control.

## Testing

`ui-sdkwork-app-modes` pins the seat declaration in apply, and the rail spec asserts the settings seat renders outside the entries group (one button per mode inside the group, the settings button outside). `ui-settings-general` renames its shell-slot bench to `mode.rail.settings`, drops the rail-state trigger test (no `wide` anymore), and pins the visually-hidden trigger label. `ui-sidebar` drops the settings-seat owner assertion and the `sidebar.settings` spec assertion; its shell snapshots regenerate without the settings area. The assembled app-modes e2e still counts seven rail buttons (the seat is empty in that boot graph, and outside the group anyway); the real-browser settings-chrome e2e still finds the trigger as the page's only 设置 button.
