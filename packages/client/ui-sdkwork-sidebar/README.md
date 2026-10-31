---
description: "The fork-owned left navigation column: upstream's sidebar seats plus ctx.sdkworkSidebar, the page registry modeled on dsh-better-sidebar's tab/page contract."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-sidebar

English | [中文](README.zh.md)

## Summary

This package occupies the layout's `sidebar` slot — the whole left column — in place of upstream `@deepseek-ai/dsh-client-ui-sidebar`. It keeps upstream's seat contract and adds a page registry: plugins contribute a left-column page through `ctx.sdkworkSidebar` and the shell draws the row, exactly the way the vendored [dsh-better-sidebar](../../../plugins/dsh-better-sidebar) lets plugins register sidebar tabs and pages through `ctx.betterSidebar.registerTab`.

The column still shows the brand row and version badge, the New Session entry, the quick-entry stack, global panel rows, the Workspace/Session browser, the footer actions and Settings — every occupant of upstream's seats keeps registering into the same holes, so nothing downstream changes.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The package is the Web composition's `ui-sidebar` row. Its source never leaves the fork, and upstream's package stays byte-identical: `packages/bundle/web-app/cordis.patch.yml` repoints the row id to this package, so upstream's plugin never loads.

### Add a left-column page

```ts ignore-check
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-sidebar/client'

export const inject = ['sdkworkSidebar', 'layout']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sdkworkSidebar.registerPage({
    id: 'my-plugin:reports',
    // A function title is re-resolved on every locale change.
    title: () => ctx.locale.bind('my-plugin')('reports'),
    order: 60,
    icon: ({ size }) => <ReportsIcon size={size} />,
    // Activate the page; open a mode overlay, select a main panel or do
    // anything else the column's caller needs.
    open: () => { ctx.layout.openPanel('reports') },
  }), 'my-plugin: reports page')
}
```

A registered page renders one row in the quick-entry stack, directly below the `sidebar.actions` seat and above the global panel rows: icon plus title while the column is wide, the icon alone in the 56px rail. The disposer runs with the caller's Cordis fiber, so HMR and unload remove the row with the plugin.

Use `ctx.sdkworkSidebar` for a plain icon+title page. `sidebar.actions` and `sidebar.panellist` remain the seats for entries that draw bespoke chrome — shortcut chips, pin menus, live badges — and keep their contracts unchanged.

### Seats this shell declares

`sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.toggle.badge`, `sidebar.actions`, `sidebar.panellist`, `sidebar.panellist.actions`, `sidebar.workspaces`, `sidebar.settings`, `sidebar.footer.action`; plus `shell.leading` for the macOS reopened-sidebar controls. The declaration types live in upstream's `contract/slots.ts` and are imported, not copied.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`src/client/service.ts` is the registry: a descriptor map, a cached sorted snapshot and a listener set. `registerPage` rejects an empty or duplicate id (misconfiguration fails at activation), returns a disposer and republishes the list; `refreshTitles` re-resolves function-valued titles when the locale changes. `src/client/index.ts` publishes the registry as `ctx.sdkworkSidebar`, mirrors its snapshot into the `pages` hook source, keeps the panel-metadata store in sync with `sidebar.panellist` and `mode.rail.panel`, and registers the shell.

The shell (`src/client/SidebarRoot.tsx`, CSS module beside it) is a fork-owned copy of upstream's navigation column. It is copied deliberately: the column's collapse crossfade, drawer geometry, keyboard focus transfer, scrollbar quieting and Windows/macOS titlebar adaptation are behaviors the fork must be able to evolve without an upstream edit, and a build-time fork of a React component is the only form that lets it. The page list is the one behavioral addition.

### The submodule is read-only

`plugins/dsh-better-sidebar` is a Git submodule pinned to a release tag that the web-app composition mounts as its `better-sidebar` row. Nothing here edits it, patches it, or vendors a modified copy of its files: a missing capability is fixed upstream, then the pin is bumped. `tests/better-sidebar-contract.client.spec.ts` fails when the submodule's tracked files are modified and when the upstream `TabDescriptor` fields this registry mirrors (`id`, `title`, `icon`, `order`) disappear. `pnpm run build:better-sidebar` builds the pinned source in place, producing only its gitignored `lib/` artifacts.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — the upstream shell whose seats and contract this package reuses.
- [ui-workspace](../ui-workspace/README.md) — the Workspace and Session browser rendered into `sidebar.workspaces`.
- [ui-settings](../ui-settings/README.md) — the settings trigger row at `sidebar.settings`.
- [ui-layout](../ui-layout/README.md) — the frame that declares the `sidebar` slot.
- [dsh-better-sidebar](../../../plugins/dsh-better-sidebar) — the vendored page/tab model this registry mirrors.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side navigation layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Pages navigate the center column; they do not render a body inside the column.** dsh-better-sidebar pages own their panel body. This column is a navigation column: a page's `open()` performs the navigation, so a page that needs an in-column body would first need a body seat here.
- **Ordering among quick entries and pages is two lists, not one.** `sidebar.actions` entries always render above registry pages, and registry pages sort among themselves by `order`. A page that must interleave between two quick entries cannot.
- **Upstream drift reaches this shell only on a sync.** `SidebarRoot.tsx` and its CSS are a copy; every upstream sync must re-resolve them. The behaviors the copy owns are listed in the implementation section.
- **The mounted plugin adds a second set of right-sidebar pages.** `dsh-better-sidebar` ships its file tree, Git, changes, tasks, side chat and editor beside the fork's own file tree, terminal, browser and document preview; both are live by default, and a deployment that wants one set removes the other's rows rather than editing either package.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Add a page behavior to `SidebarRoot`'s `PageRow` rather than to a descriptor; keep the descriptor limited to what the row actually reads. When upstream's sidebar shell changes, diff `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` against the copy and re-apply the page-list insertion only.

</details>
