# Agent Note: Publish and install are independent template dialogs

Status: implemented

English | [中文](2026-11-13-independent-template-publish-install-dialogs.zh.md)

## Problem

The first template-center implementation put publication and installation in one dialog with a tab switch. The frame owned both states, the publish tab mounted the install panel behind a conditional and the install panel read its own catalog while sharing the publish dialog's close, account, and sign-in logic. The result was a surface whose two halves could not evolve independently: a change to the publish wizard could remount or reset the install tab, the install flow inherited publish-only concerns, and a result footer could switch into an install surface that was really a second product area. The row menu exposed one ambiguous `openTemplate({ tab })` capability, so a provider had to implement both halves to offer either one.

## Decision

Publish and install are two dialogs, two flows, and two optional service methods.

- `deployPublish.openPublishTemplate({ defaultDirectory })` mounts `PublishTemplateFlow` → `TemplatePublishDialog`. The dialog owns the app/custom directory scan, platform-app and template dedupe, the two-stage single-app wizard, the store-asset uploads (logo, cover, sample pages) and its one publish run with the result shown inline. It imports no install module.
- `deployPublish.openInstallTemplate({ defaultDirectory })` mounts `InstallTemplateFlow` → `TemplateInstallDialog` → `TemplateInstallPanel`. The dialog owns only its sign-in/frame wiring; the panel owns the template/market catalog, target selection, install run, and per-row install feedback. It imports no publish module.
- The row menu advertises each action only when its own service method exists (`openPublishTemplate` for 发布为模板, `openInstallTemplate` for 从模板安装), so a composition can provide one without the other.
- The publish result view no longer offers a "go install" switch. Installation is reached from its own row action, not as a mode of the publish surface.

The two dialogs share exactly two lower-level pieces:

1. `TemplateDialogFrame` — modal chrome, account chip, close/Escape/busy handling, and the sign-in gate. It never reads publish or install state.
2. `useTemplateHostSession` — builds the deploy clients and reads the IAM account, then refreshes them on host notifications. It never reads a flow's selection, catalog, or run.

`TemplateDialog.module.css` remains the shared design-token stylesheet for the frame and the two surfaces' primitives; each panel keeps its own layout classes and state. The service still uses one isolated React root for modal teardown, but opening either dialog replaces the other because only one modal is ever on screen.

## Alternatives considered

- **Keep the tabs and isolate state per tab.** Rejected: the frame still owns both lifecycles, the publish result can still switch surfaces, and the service capability remains one ambiguous method. The two products would keep sharing a close path and a sign-in gate by accident rather than by explicit primitive.
- **Give each dialog its own overlay/header/account/user-chip implementation.** Rejected: that duplicates focus, Escape, busy, sign-in, and account-chip behavior and lets the two surfaces drift. A presentational frame with no flow state is the low-coupling shared piece.
- **Keep one controller/hook for both flows.** Rejected: a shared controller would recreate the coupling under a different name. Only host client/account binding is genuinely common.
- **Open install from the publish result as well as from the row menu.** Rejected for this split: it would make the publish dialog depend on the install flow again. The row menu is the install entry.

## Consequences

- Each dialog reads only its own catalog: publish reads platform apps, templates, categories, and app scans; install reads templates/marketplace and install targets. Neither can reset the other's selection.
- A provider that implements only `openPublishTemplate` shows only the publish row; one that implements only `openInstallTemplate` shows only install. The header popup remains the app inventory.
- The install dialog is still gated on an IAM user session through the shared frame. It now feeds its own row-run busy state back to the frame, so closing/Escape is locked while a file install is in flight just as publish locks it during a publish.
- The shared frame's focus, Escape, close, and sign-in behavior is one implementation instead of two. Flow-specific copy, titles, and body panels stay in their own dialogs.
- Panel and CSS names now reflect install (`TemplateInstallPanel`, `TemplateInstallDialog`); the old combined `TemplateCenterDialog` and tab markup are gone.

## Verification

- `template-publish-dialog.client.spec.tsx` pins the publish-only dialog: no install tab, no install text, radio single-selection across two apps, the two-stage single run, the custom-directory path, manual type override, retry, and reset.
- `template-install-dialog.client.spec.tsx` pins an install-only dialog title and sign-in gate with no publish chrome.
- `template-install-panel.client.spec.tsx` drives the real install chain over stub clients; the publish dialog tests never mount the install panel.
- `publish-template-flow.client.spec.tsx` pins the publish flow's late IAM hydration and title.
- `template-source.client.spec.ts` pins the service's `openPublishTemplate`/`openInstallTemplate`/`installTemplate` surface.
- `row-menus.client.spec.tsx` pins that each row calls only its own method and that a provider missing both hides both rows.
