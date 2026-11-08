---
description: "SDKWork assistant: the rail cell directly below Home that opens the linked persona-bot (Tobs / DeepSeekBot) surface."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-assistant

English | [中文](README.zh.md)

## Summary

The assistant's product surface: two navigation entries, one in each column. The mode rail carries one cell directly below Home — the product name 助理 (English "Assistant") and [a robot-head glyph](src/client/AssistantIcon.tsx) in the rail's outline weight. The left column's New Session area carries one quick entry in the sidebar's `sidebar.actions` seat, drawn exactly like the scheduled-tasks entry beside it: 16px outline glyph, 助理 label, no artwork background, no badge. Both open the persona-bot layer's interface, which the linked `@botharness/ui` plugin publishes as its `botharness` main panel.

The panel owns the whole surface; this package owns the name, the glyph, and the navigation. Each entry selects that panel through `ctx.layout.selectPanel`, exactly as the plugin's own `sidebar.panellist` row does, so the center column shows the plugin's interface while the frame's mode stays `code`. Because the mode never changes, the rail cell paints its selection from the main-panel selection (`usePanelInfo`) rather than from the rail's own `active` owner prop, and the rail's mode cells stay dark while a panel owns the column.

The plugin's own `sidebar.panellist` row — its avatar artwork and onboarding badge — is suppressed through `ctx.sdkworkSidebar.suppressPanel`, so the left column keeps exactly one entry to the surface. That suppression follows the sidebar service, so a profile without this column still gets the rail cell.

Both entries exist only while that main panel is registered: a composition without the plugin — a profile that disabled its rows, or a build that does not ship the `deepseekbot` dependency — offers no dead navigation, and a plugin teardown removes the entries with its panel.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only navigation chrome: opening the assistant changes browser viewing state only, and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **The panel identity is a published string** — the cell selects `botharness`, the main-panel key `@botharness/ui` registers as `PANEL_ID`. The plugin exports no id for hosts to import, so a rename upstream means updating `ASSISTANT_PANEL_ID` in this package.
- **The mode id is host vocabulary** — `assistant` is added to `AppModeId`, the rail order, the fixed (unhideable) mode set, and the window-title dictionary by this integration. The frame never switches to it: it is the rail cell's key, and the panel selection is the surface.
- **The cell is reorderable but not hideable** — it is a fixed mode, so the customize dialog can move it and cannot uncheck it. Making it hideable would let the product's headline assistant surface disappear from the rail.
- **The plugin's own artwork row is suppressed, not edited** — `@botharness/ui` registers a `sidebar.panellist` row drawn with its avatar image and a "试试看" onboarding badge. This package suppresses that row while the assistant quick entry exists; the plugin's bundle stays untouched, and removing this package restores the plugin's own row.
- **The linked surface's browser and computer rows are not mounted** — this integration composes `@botharness/core` and `@botharness/ui`, not the plugin's optional `@botharness/browser` and `@botharness/computer` capability rows. A deployment that wants the Bot Browser and computer control adds those rows in a later patch layer together with their dependencies.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The integration has four seams, none of which copies the plugin:

1. **Host composition** — the web-app patch mounts `@botharness/core` (Bot registry, memory repositories, `/api/botharness/*` routes, bot session driver), `@botharness/ui` (the browser half) and the `deepseekbot` agent preset the core row names.
2. **Availability** — this package's apply subscribes to the `main` slot registry and registers the rail cell and the sidebar quick entry only while an entry keyed `botharness` exists. That is the only contract between the two packages, and it makes the navigation's lifetime the panel's lifetime.
3. **Navigation** — each entry's inject face closes over `ctx.layout.selectPanel('botharness')`; the plugin's panel renders the interface, its own `registerModeShadow` swaps the left column for the Bot-mode sidebar, and the fork's sidebar returns when the panel closes.
4. **One entry per column** — `ctx.sdkworkSidebar.suppressPanel('botharness')` drops the plugin's own `sidebar.panellist` row while this package supplies the quick entry, and restores it if this plugin unloads.

Do not re-register, wrap, or copy the plugin's component tree: it registers `main`, `sidebar`, and the settings section against public slot seats, and every one of those registrations must stay the plugin's own.

</details>
