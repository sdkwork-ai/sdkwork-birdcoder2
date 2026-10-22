# Agent Note: IM connector as a mode-rail shortcut

Status: implemented

English | [中文](2026-10-20-im-connector-rail-entry.zh.md)

## Problem

The built-in IM plugin (`@xmanrui/dsh-im`) showed up in the product's navigation as a `sidebar.panellist` row at the bottom of the sidebar's quick-entry stack, below 需求大厅, and then as a rail shortcut that opened the plugin's `main` panel inside the code surface. Both placements are wrong for this surface: the row duplicates the product's own navigation, and the code-surface panel keeps the workspace/session sidebar beside the IM management interface.

The product wants the IM surface to behave like the app store: one leftmost icon, and a full page with the icon rail and the IM content only — no workspace sidebar — named **IM链接器** rather than the plugin's panel copy IM机器人. It also wants the complete management interface to stay on screen when a channel is not linked or its gateway is unreachable; connection state belongs inside the panel, not in place of it.

The plugin is a linked git submodule whose committed `lib/*.js` ships as-is ([built-in IM integration note](../architecture/2026-10-09-built-in-im-plugin-via-git-submodule.md)), so the host cannot rename or re-register the plugin's own row or surface by editing the plugin. It does publish `dshImClient` v1, a supported service that builds the complete management panel for a host.

## Decision

- The mode rail gains `mode.rail.panel`, a root-scoped list seat declared by ui-sdkwork-app-modes and rendered directly above `mode.rail.settings`, outside the mode group. Each shortcut owns its chrome, glyph, label, and click, receives the frame's `activeMode` as owner props, and opens its surface through the layout service.
- `im` is a new app mode in the frame's vocabulary. `ui-sdkwork-im-connector` registers the keyed `mode.page` for it, rendering the plugin's panel through `dshImClient.render()` inside the plugin page's own surface geometry (a scrolling full-height frame with a 1080px content column). The frame therefore shows the icon rail and the page, never the workspace sidebar — the same composition as the app store and the other rail modes.
- The mode page is independent of channel connectivity. It mounts and renders the complete management panel whether an account is bound, a bot is running, or the gateway answers; the panel's own cards, QR flow, and status copy describe the failure. No error state from the connector replaces the interface.
- `ui-sdkwork-im-connector` registers the rail shortcut above Settings, under the plugin's published panel id (`xmanrui-dsh-im`). It paints the active cell when the frame's `activeMode` is `im` and switches the frame to `im` on click.
- The rail shortcut's list id is the panel id the sidebar filters: ui-sidebar omits `sidebar.panellist` entries that also appear in `mode.rail.panel`, so the plugin's own row disappears without editing the plugin. The panel body, its settings section, and the plugin-detail action stay untouched.
- The shortcut and the page are projections of the plugin's `dshImClient` v1 service: a child injection owns both registrations, so a composition without the IM plugin shows no dead icon and a plugin teardown removes the product navigation with its panel.

## Alternatives considered

**Keep the plugin's `main` panel and hide the sidebar only for it.** The frame's `sidebarVisible` decision is a pure function of the active surface; hiding one main panel would require a second navigation fact and a frame-wide subscription to panel selection, which the frame deliberately avoids. The app-store-style surface is exactly a mode page, so the mode is the smaller change.

**Render the IM panel as a mode page from the start.** This was rejected in the first iteration because the panel also needs to stay reachable from the plugin page and because a mode adds `AppModeId`, page, and window-title vocabulary. The product has since required the app-store composition (no workspace sidebar), which only a mode page provides; the `mode.rail.panel` shortcut keeps the entry out of the mode group so it can still sit above Settings.

**Edit the dsh-im submodule to move or rename its row.** The built-in IM decision fixes the plugin as an unedited linked artifact whose pin can advance without a fork merge; editing it would fork the plugin, and its committed browser bundle would have to be rebuilt and re-shipped on every sync. Product navigation belongs to the host.

**Hardcode the hidden id in ui-sidebar.** One id plus a filtered list is less code, but it embeds a third-party product id in an upstream-merged shell and makes the next rail shortcut edit the same file again. The filter reads the rail seat's own registration list instead, so the rule is generic.

**Move `sidebar.panellist` itself into the rail.** That moves every global panel in every composition — including upstream's task manager and plugin manager when their switch is on — and re-homes an upstream contract. The product wants this panel's shortcut, not a general migration.

**Rename or shadow the plugin's settings section.** That section is the plugin's own registration; shadowing it would duplicate its panel wiring and would break the optional desktop integration's `setSettingsVisible(false)` contract. The plugin keeps its own copy, and the rail entry and mode title carry the product name.

## Consequences

- The IM panel is now a full app surface: while it is open the workspace/session sidebar is not rendered. Returning to any mode restores the sidebar.
- The connector's page always shows the complete management interface; a failed or missing IM SDK connection is reported inside the panel rather than as a page-level error. A host that cannot load the IM plugin at all has no panel service, so the shortcut and page are absent instead of dead.
- The plugin's own `main` panel and its plugin-detail action remain registered; they are a separate navigation path that still opens the code-surface panel with the sidebar visible.
- The sidebar's panel list no longer offers the IM panel while the rail shortcut does; `sidebar.panellist` documents that a rail-backed panel is listed by its shortcut alone.
- `im` joins the frame's mode vocabulary and the window-title dictionary. Another IM surface would reuse that page.
- The plugin's own copy (IM机器人 / IM bots) remains in the settings section and the plugin-detail action; the rail entry, the mode page title, and the window title use the connector name.

## Verification

The `ui-sdkwork-im-connector` specs pin both registrations following the `dshImClient` service (present, absent, service teardown, plugin teardown), the mode switch, the `im` page rendering the service's element, the bilingual copy, and the entry's selection and hover-label behavior. The app-modes specs pin the new seat outside the mode group, directly above Settings, receiving the frame's active mode. The ui-sidebar panel-list spec pins a rail-backed panel's row being filtered and restored. The common-app-header specs cover the `im` window title. An assembled browser run shows the mode page with the icon rail and no workspace sidebar, and the panel opening from another mode.
