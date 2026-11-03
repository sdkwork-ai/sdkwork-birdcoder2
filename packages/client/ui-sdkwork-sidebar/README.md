---
description: "The fork-owned left navigation column: upstream's sidebar seats plus ctx.sdkworkSidebar, the registry of plugin-contributed pages and of panels whose rows another surface embeds, and the Sidebar settings page that shows or hides every entry."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-sidebar

English | [中文](README.zh.md)

## Summary

This package occupies the layout's `sidebar` slot — the whole left column — in place of upstream `@deepseek-ai/dsh-client-ui-sidebar`. It keeps upstream's seat contract and adds a page registry: plugins contribute a left-column page through `ctx.sdkworkSidebar` and the shell draws the row, exactly the way the vendored [dsh-better-sidebar](../../../plugins/dsh-better-sidebar) lets plugins register sidebar tabs and pages through `ctx.betterSidebar.registerTab`.

The column still shows the brand row and version badge, the New Session entry, the quick-entry stack, global panel rows, the Workspace/Session browser, the footer actions and Settings — every occupant of upstream's seats keeps registering into the same holes, so nothing downstream changes. The column also owns the visibility preference: the settings dialog's **Sidebar** page lists every row the column can draw and switches each one.

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

### Suppress a panel row you embed

A plugin that draws another plugin's global panel inside its own surface owns that panel's navigation, so the panel's own row would be a second entry to the same page. Declare the panel as embedded and the column leaves its row out:

```ts ignore-check
ctx.effect(() => ctx.sdkworkSidebar.suppressPanel('other-panel'), 'my-plugin: embedded panel row')
```

The disposer (run with the caller's Cordis fiber, like `registerPage`) restores the row. Suppression filters only the `sidebar.panellist` row list; the panel stays registered and selectable. The rule is the same one the column applies to a panel the mode rail exposes as a shortcut — another surface is that panel's navigation entry — with the embedding plugin as the authority instead of a second seat.

### Show or hide a column entry

The **Sidebar** page in Settings (`settings.section`, id `sidebar-layout`) lists the rows the column can draw — quick entries, registry pages, and global panel rows — with one switch per row. A switch writes the persisted preference immediately, so the column behind the dialog re-renders live; hiding removes the row and nothing else, and the shipped preference shows every row. The stored set names what is HIDDEN, not what is shown, so an entry a plugin registers after the preference was written joins the column without a migration.

A `sidebar.actions` registrant that wants its quick entry configurable declares the row's display text as the registration's `label` — a thunk, so a locale switch re-resolves it. An entry without a label still lists, under its registration id. The fixed `plugins` panel launcher is not offered: it always shows.

### Seats this shell declares

`sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.toggle.badge`, `sidebar.actions`, `sidebar.panellist`, `sidebar.panellist.actions`, `sidebar.workspaces`, `sidebar.settings`, `sidebar.footer.action`; plus `shell.leading` for the macOS reopened-sidebar controls. The declaration types live in upstream's `contract/slots.ts` and are imported, not copied.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`src/client/service.ts` is the registry: a descriptor map, a suppressed-panel set, a cached sorted snapshot and a listener set. `registerPage` rejects an empty or duplicate id (misconfiguration fails at activation), returns a disposer and republishes the list; `refreshTitles` re-resolves function-valued titles when the locale changes; `suppressPanel` records an embedded panel id (idempotent, disposer restores it) and notifies, because the caller's row is filtered from a projection this registry does not own. `src/client/index.ts` publishes the registry as `ctx.sdkworkSidebar`, mirrors its snapshot into the `pages` hook source, keeps the panel-metadata store in sync with `sidebar.panellist`, `mode.rail.panel` and the suppressed set, and registers the shell.

`src/client/layout.ts` owns the visibility preference: a localStorage-backed snapshot store of hidden ids, the grouped item list the settings page edits (`sidebarItems`), and the equality guard that keeps an unchanged republish from waking the column. `apply` republishes that list whenever a contribution, a page, a panel, a title or the preference moves, and hands the one snapshot to both surfaces through the inject `hooks` compartment. `src/client/SidebarLayoutSection.tsx` is the settings page: it renders the published groups and routes each switch and the reset through the injected writes.

The shell (`src/client/SidebarRoot.tsx`, CSS module beside it) is a fork-owned copy of upstream's navigation column. It is copied deliberately: the column's collapse crossfade, drawer geometry, keyboard focus transfer, scrollbar quieting and Windows/macOS titlebar adaptation are behaviors the fork must be able to evolve without an upstream edit, and a build-time fork of a React component is the only form that lets it. The page list and the visibility filter are the behavioral additions: a quick entry renders through `renderSlot(..., { only })` one id at a time, so a hidden row is simply not drawn, and hidden page and panel ids drop from their stacks.

The shell also owns the `sidebar.workspaces` viewport contract its occupant (ui-workspace) is written against: the page and panel rows and the browsing region share one vertical scroller below the fixed brand and New Session controls, that scroller is the slot's size container (`100cqh` for the section), it is a scroll-state container, and it carries `data-sidebar-scrollport` while expanded. Each render hands the occupant `hookContext.useSectionScroller` through the slot-level `sectionScroller` inject that this package declares, so the browser binds its own list and wheel scrolling crosses from the navigation into that list. `src/client/scroll-handoff.ts` is the split logic, a copy for the same reason the shell is one: upstream keeps it private to its own shell and imports only its types.

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
- **A page row starts on the navigation viewport's boundary, not the quick entries' rhythm.** Pages are the first content of the scrolling viewport, so the first page row sits below the viewport's leading 4px margin and 8px spacer row and carries 12px more air above it than a quick-entry row does. That stack boundary is deliberate; an entry that must match the quick entries' spacing belongs in `sidebar.actions`.
- **The visibility preference is device-local.** Hidden ids live in the `dsh.sidebarLayout` localStorage blob, like the mode rail's layout, not in the Host settings document, so they do not travel with a profile across devices.
- **One row is never configurable.** The fixed `plugins` panel launcher always shows, so the Sidebar page does not list it.
- **Hiding removes the entry, not the capability.** A hidden page or panel keeps its registrations and can still be reached from another surface (a rail entry, a shortcut, a linked action); a quick entry that was the only way in becomes unreachable until it is switched back on.
- **Upstream drift reaches this shell only on a sync.** `SidebarRoot.tsx` and its CSS are a copy; every upstream sync must re-resolve them. The behaviors the copy owns are listed in the implementation section.
- **The mounted plugin adds a second set of right-sidebar pages.** `dsh-better-sidebar` ships its file tree, Git, changes, tasks, side chat and editor beside the fork's own file tree, terminal, browser and document preview; both are live by default, and a deployment that wants one set removes the other's rows rather than editing either package.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Add a page behavior to `SidebarRoot`'s `PageRow` rather than to a descriptor; keep the descriptor limited to what the row actually reads. When upstream's sidebar shell changes, diff `packages/client/ui-sidebar/src/client/SidebarRoot.tsx`, `src/client/scroll-handoff.ts` and `src/client/index.ts` against the copies and re-apply the page-list insertion only: the viewport markup and CSS (`.scrollRegion`/`.scrollArea`/`.scrollFade`), the slot-level `sectionScroller` inject on `sidebar.workspaces`, and the hand-off code are upstream's, not this fork's. The visibility filter reads the published layout rather than the registrations directly, so a new stack joins it by adding to `SIDEBAR_ITEM_GROUPS` and to `SidebarRoot`'s own stack render — never by reading slots in the component.

</details>
