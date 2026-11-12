# Agent Note: The settings menu's 我的应用 drawer — two read-only ledgers

Status: implemented

English | [中文](2026-11-12-settings-my-apps-two-tab-drawer.zh.md)

## Problem

The settings popover had one ledger row, 我的应用部署, that listed only the caller's `deploy_app` rows. Publishing an app as a development-scaffold template creates a second account-owned artifact — a template listing — and nothing in the app answered "which templates did I publish?" without opening the project row menu's template center, which is scoped to one project directory. The row name also promised deployments while the surface is the account's apps, and it hid the templates the same account owns.

## Decision

The row is 我的应用 and opens one wide modal with two tabs, 我的应用 and 我的应用模板, over the same host-constructed client pair (`settings.myDeployments` seat, `my-deployments` row id unchanged).

- 我的应用 keeps the existing read-only `deploy_app` ledger: `apps.list` under the `USER` scope, 100 rows per page with a five-page ceiling, the application-kind facet as local OR chips, newest first.
- 我的应用模板 reads `template.appTemplates.list` (already account-scoped) with the same paging and ceiling, a listing-status facet in publish-first order, and rows carrying name, key, summary, status, latest semantic version, install count and update time.
- The latest version is a side read. The listing's own `version` field is an optimistic-lock counter, so each row's version page is read and matched by `latestVersionUuid` (first row as fallback). Reads run through a four-worker pool with the drawer's `AbortSignal`, so closing the tab cancels the remainder; a failed read hides only that row's badge.
- Both panel elements stay in the DOM so each tab's `aria-controls` resolves, but a ledger mounts on first visit: opening the drawer reads only 我的应用, and the template read starts when the tab is first opened. The drawer resets to 我的应用 on close; a visited ledger keeps its rows, facet selection and versions across a switch while the drawer stays open.
- Neither ledger writes. Publishing, installing and template management stay on the project row menus and the app template center. The template tab's empty state names the row-menu 发布为模板 action, and the package README records that installs need a project directory and target, which the template center owns.

## Alternatives considered

- **Mount the template center inside the drawer.** Rejected: publishing and installing need a project directory and target choice, the center is already reachable from the row menus, and two 90vw overlays would compete for the same layer.
- **Give templates their own popover row.** Rejected: the account's deployments are one inventory, and two near-identical ledger rows would make "where do I look" a naming puzzle.
- **Mount both ledgers eagerly.** Rejected: it doubles the drawer's open cost for a tab most operators never open.
- **Show the listing's `version` field as the template version.** Rejected: it is an optimistic-lock counter, not a semantic version.
- **Reuse the template center's download panel verbatim.** Rejected: it owns install targets and a target side panel; the drawer needs a read-only inventory, not a second install surface.
- **Visible page controls instead of loading up to the ceiling.** Rejected: the caller-owned set is small, a pager would add state without changing what is reachable, and the truncation note keeps the rest discoverable in the deployments console.

## Consequences

- The template tab costs one listing walk plus one version-page read per listing (at most four concurrent). Large accounts are documented in the package README's Known Limitations; there is no cross-open version cache, and every drawer session re-reads.
- Facet filtering and version resolution are local: a listing beyond the five-page ceiling is not loaded, and a failed or empty version read leaves that row listed without a version badge.
- The templates tab reuses the template center's status copy (`templateCenter.download.status.*`) so one listing reads identically on both surfaces.
- The drawer carries no per-tab counts and no search; both are recorded as deferred in the package README instead of being half-built.

## Verification

- `packages/client/ui-sdkwork-deploy/tests/deployed-templates.client.spec.ts` pins the shared page walk, status facets, ordering, version matching/fallback/omission, the abort short-circuit, and the install-count rule.
- `deployed-templates-panel.client.spec.tsx` pins the paged account read with its abort signal, the badges, facets, loading/empty/failure/truncation states, late-settle cancellation, and retained rows on a failed refresh.
- `deployed-apps-dialog.client.spec.tsx` pins the readiness gates, the tab switch without re-reads, both `aria-controls` targets, and the reset-on-reopen behavior.
- `packages/client/ui-sdkwork-settings-menu/tests/settings-menu-root.client.spec.tsx` pins the renamed row and the seat toggle.

## Prior art

- [The app template center](2026-11-12-app-template-center-scaffold-publish-install.md) owns publishing and installing templates; this drawer only reads the listings it creates.
