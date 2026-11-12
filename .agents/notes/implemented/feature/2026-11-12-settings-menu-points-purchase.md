# Agent Note: Points purchase from the settings-menu wallet card

Status: implemented

English | [中文](2026-11-12-settings-menu-points-purchase.zh.md)

## Problem

The settings-menu wallet card (`settings.menu.plan`, the Token Plan plugin's account card) rendered two actions, 升级套餐 and 购买积分, and both did the same thing: they dismissed the popover and switched the frame to the Token Plan mode. The catalog page does offer a top-up entry, but the user asked for the purchase where they had just looked at the balance — clicking 购买积分 in the popover must open a purchase dialog, and the balance shown after the purchase must be the settled one rather than the pre-purchase figure.

The popover is what makes this more than a wiring fix. `SubmenuMenu` renders `open && (…)`, so every close path — pointer-leave grace, Escape, outside click, row selection — unmounts the whole menu subtree. A purchase dialog rendered inside the card would therefore be torn down by any dismissal of the menu, and the menu closes itself on the very first pointer disengagement as the user reaches for the dialog.

## Decision

The purchase surface is a seat the settings shell owns, not card content:

- **`settings.pointsRecharge`** is a new root-scoped feature-modal seat, typed in `ui-settings` next to the other root-scoped feature modals and granted at runtime by `ui-sdkwork-settings-menu`'s `mode.rail.settings` entry. Its owner share is `{ open, onClose }`; the shell holds the visibility in component-local state and renders the seat beside the settings panel, outside the popover, so the modal outlives the menu that asked for it.
- **The card carries one more affordance.** `SettingsMenuPlanOwnerProps` gains `openPointsRecharge`, so the wallet card dismisses the menu through the existing `close` share and then asks the shell for the modal. 升级套餐 keeps its old behavior and still opens the mode.
- **The Token Plan plugin contributes the modal.** `PointsRechargeDialog` renders the Order-owned `SdkworkPointsRechargeDialog` with the same copy projection (`recharge-copy.ts`) the catalog page's host components use, so both surfaces cannot drift. The component mounts only while open: it resolves the recharge port and reads the wallet on the opening gesture, and the port is `undefined` on a deployment with no API environment, which the modal reports with `page.unconfigured` instead of crashing on a service it cannot build.
- **Settlement re-reads the balance.** The Order dialog polls the payment to `completed` and calls the host's `onCompleted`; the host re-reads the wallet then, so the modal header shows the credited points. Neither surface caches the figure — the card re-reads the wallet every time the popover mounts it — so the next menu open shows the same settled balance.
- **`pointsRechargeTheme.css` is reused unchanged.** The dialog is styled against `--dsw-*` aliases keyed off `body[data-ds-dark-theme]`, so it follows the app appearance without a `SdkworkThemeProvider` wrapper and without mutating the document root from a second surface.

## Alternatives considered

**Render the dialog inside the wallet card.** The cheapest wiring, and wrong: the popover unmounts its content on every close path, and the menu also closes on pointer-leave grace the moment the pointer moves toward the dialog, so a payment would disappear mid-scan.

**Keep the popover alive while the dialog is open.** The menu's owner is the shell, so the card cannot veto its dismissal. Suppressing `closeOnPointerLeave` plus the menu's document-level outside-click listener would still let a click inside the dialog close the menu underneath it, and the dialog would unmount anyway.

**Navigate to the Token Plan mode and open the catalog's own recharge dialog.** This is what the card used to do. It answers "purchase" with a mode switch plus a second click, loses the popover context, and leaves the settings surface for a full-page catalog; the user asked for the purchase to happen in place.

**Let the rail entry own the modal (the usage-billing dashboard pattern).** `ui-sdkwork-token-plan`'s rail entry is always mounted, and the usage card's dashboard proves a persistent sibling can host a modal. But the rail entry is a mode button, and hanging commerce state on it would make the modal's lifetime depend on an unrelated seat; the settings shell already owns six root-scoped feature modals opened from popover rows, and this is the same relationship.

**Duplicate the recharge copy in the new component.** The mapping is 23 locale keys; two copies would drift the moment a key is renamed. A shared internal projection keeps the catalog modal and the settings modal on one dictionary.

## Consequences

- The settings shell gains one state flag, one close callback, one render site, and one owner-share member; `settings.menu.plan` registrants that ignore `openPointsRecharge` still compile and run.
- The Token Plan plugin gains `PointsRechargeDialog.tsx` and `recharge-copy.ts`, and `commerce-components.tsx` now consumes the shared projection instead of its inline copy map.
- The purchase modal's balance read reuses `readAccountSummary()`, the same reader as the card, so the dialog header and the card agree by construction (two gateway reads per open, the card's existing cost).
- The menu still closes when the dialog opens: the modal is the only surface on screen, which is what a payment flow wants.

## Testing

`settings-menu-root.client.spec.tsx` pins the seat contract: the shell renders `settings.pointsRecharge` closed, the wallet card's owner share opens it, and its `onClose` closes it again. `settings-menu-plan-card.client.spec.tsx` pins the action split: 升级套餐 closes then opens the mode, 购买积分 closes then opens the purchase modal and never navigates. `points-recharge-dialog.client.spec.tsx` stubs the Order dialog to pin the host contract (closed renders nothing and reads nothing, the balance feeds the header, settlement re-reads it, a failed or absent balance keeps the placeholder, a deployment without an API environment shows the unconfigured notice). `points-recharge-dialog.real.client.spec.tsx` renders the real Order dialog through the wrapper and asserts the localized title, the wallet figure, the recharge terms, and the empty catalog. `apply.client.spec.ts` asserts the registration and the deferred, failure-safe port.
