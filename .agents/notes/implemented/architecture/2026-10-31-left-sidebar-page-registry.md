# Agent Note: Left sidebar host and its page registry

Status: implemented

English | [中文](2026-10-31-left-sidebar-page-registry.zh.md)

## Problem

The left navigation column is the upstream `ui-sidebar` shell. Its entries arrive through three unrelated seats — `sidebar.actions` (fork quick entries), `sidebar.panellist` (global panels) and `sidebar.workspaces` (the browser) — and every fork surface that wants a plain navigation row has to write a component, its CSS module and a slot registration for it. The fork cannot evolve the shell at all without editing an upstream file, which the merge rules forbid.

The wider ecosystem solved the same problem differently: [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) makes the sidebar a page host. A plugin registers a page descriptor (`{ id, title, icon, order }`) against a service and the host draws the row and the page body. That plugin's own surface is the right workbench, so it cannot supply this column; only its model transfers.

## Decision

The left column becomes a fork-owned shell with a page registry, and the vendored plugin supplies the model the registry mirrors.

### The shell is fork-owned, the contract stays upstream's

`packages/client/ui-sdkwork-sidebar` registers the layout's `sidebar` slot, and `packages/bundle/web-app/cordis.patch.yml` repoints the existing `ui-sidebar` row id to it — the same replacement rule the settings shell uses, so upstream's plugin never loads and `packages/client/ui-sidebar` stays byte-identical. The fork package imports upstream's `contract/slots.ts` types and declares the identical `sidebar.*` children, so `ui-workspace`, `ui-settings`, `ui-brand-official`, the New Session entry and every quick entry keep registering into the same holes. No downstream package changes.

The shell itself (`SidebarRoot.tsx` plus its CSS module) is a copy of upstream's. Copying, rather than delegating, is what makes the column fork-owned: collapse crossfade, drawer geometry, focus transfer, scrollbar quieting and the Windows/macOS titlebar adaptations are behaviors the fork must be able to change without an upstream edit, and the fork cannot import another plugin's component. Every upstream sync re-resolves the copy.

### `ctx.sdkworkSidebar` is the page contribution surface

The registry (`src/client/service.ts`) publishes through `ctx.provide('sdkworkSidebar', ...)`: `registerPage` rejects empty and duplicate ids, returns a Cordis-effect-compatible disposer, keeps one sorted snapshot reference until something changes, and re-resolves function-valued titles on locale change. The shell renders each page as a row in the quick-entry stack — icon plus title wide, icon alone in the 56px rail — and the descriptor's `open()` performs the activation.

`sidebar.actions` and `sidebar.panellist` remain for entries that draw bespoke chrome (shortcut chips, pin menus, live badges). A page is the plain icon+title row; that split is what keeps this addition from re-typing two working seats.

`ui-sdkwork-demand-hall` is the first consumer: its component, CSS module and `sidebar.actions` registration are replaced by one `registerPage` call, and its row keeps its position (order 51) and its capsule geometry, painted with the shared control radius instead of the quick entries' local 10px.

### The vendored plugin is read-only and its model is test-enforced

`plugins/dsh-better-sidebar` is a Git submodule pinned to a release tag and never edited; a missing capability goes upstream and the pin moves. `tests/better-sidebar-contract.client.spec.ts` enforces both halves of the mirror: the submodule has no modified tracked file, and upstream's `TabDescriptor` still declares `id`, `title`, `icon` and `order`. The plugin mounts as the web-app `better-sidebar` row, so its pages join the right Sidebar beside this fork's own tab set, and its `lib/` artifacts are produced from the pinned source by the workspace `prepare` build.

## Alternatives considered

**Keep upstream's shell and add another list seat.** Least work, but it leaves the fork unable to evolve the column and adds a fourth way to put a row in the sidebar. The column's ownership, not its row count, is what the merge rules keep costing.

**Mount dsh-better-sidebar and let its panel be the left column.** Its panel is a fixed-position right-docked workbench built from its own store, portal and CSS; it renders no left slot and exposes no placement switch. Using it for the left column would require editing the submodule, which the read-only rule forbids.

**Register pages into the existing `sidebar.panellist`/`sidebar.actions` seats.** A page would then be a slot component again, and the service could not accept a page from a plugin that ships no component — the property that makes the registry worth having. It would also give up the typed descriptor and the disposal contract.

**Make registry pages render their body inside the column.** That is the upstream plugin's actual page model, and it would change what the current entries do: `应用商店`, `定时任务`, `插件…`, `模板库` and `需求大厅` open a center-column panel today, and moving them into a 260px column is a product change, not a refactor.

## Consequences

`packages/client/ui-sidebar` keeps its types and contract but is no longer mounted; its shell diverges on every upstream sync and must be re-resolved by hand. Every future left-column entry chooses between `ctx.sdkworkSidebar` (plain row) and the two slot seats (bespoke chrome), and pages always render after quick entries because they are a second list, not a merged one. The vendored plugin is mounted by the web-app composition, so its dependencies enter `pnpm-lock.yaml`, its gitignored `lib/` is built from the pinned source at install time, and its right-Sidebar pages sit beside the fork's own — two tab sets, one product decision to keep or drop either.

## Verification

`pnpm exec vitest run packages/client/ui-sdkwork-sidebar/tests` covers the registry (ordering, disposal, duplicate ids, title refresh) and the shell (page rows wide and collapsed, ordering relative to the workspace region); `packages/client/ui-sdkwork-demand-hall/tests/apply.client.spec.ts` covers the migrated consumer, including teardown. The contract spec covers the submodule's read-only state and descriptor alignment. The shipped column is verified by rebuilding the client bundles and inspecting the running desktop window: the same entries render in the same order, and the Demand Hall row is unchanged.
