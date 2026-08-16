# Agent Note: Sidebar app modes — the WeChat-style mode rail, placeholder pages, and the sidebar-visibility preference

Status: implemented

English | [中文](2026-08-16-sidebar-app-modes.zh.md)

## Problem

The web/desktop GUI had a single surface: the Code workbench (sidebar + conversation). The request was a WeChat-desktop-style mode switcher — a leftmost icon rail with Code / Work / Video / Image / App Store entries — plus a settings-center preference controlling whether the sidebar shows. Video, Image, and App Store display placeholder pages for now; Code keeps the workbench.

## Decision

A new `ui-app-modes` client plugin owns the surface; the frame gains the mode state and two slots:

- **The mode rail is a fixed frame track, not part of the sidebar column.** AppFrame's grid becomes `mode.rail | sidebar | center | details` with a 56px `MODE_RAIL_WIDTH` track that never participates in the concession chain (netted out of the viewport before the solve). The rail stays mounted in both sidebar states, so mode switching never depends on the sidebar being expanded, and the existing sidebar collapse animation, scrollbar-linger logic, and 56px control rail are untouched. The rail is a shell: it renders one keyed `mode.rail.entry` seat per mode id in launcher order and hands each entry the live selection facts, and every mode module contributes its own entry — the base five from ui-app-modes, Knowledge Base and Assets from the independent `ui-knowledge` and `ui-assets` packages (each with its own glyphs, copy, page, and tests).
- **The active mode lives in the layout store** (`mode` field + `setMode` action). AppFrame reads it through its own store — the only reactive channel a root-entry component has — and hands it to the rail as owner props (`mode` + `setMode`), so the rail holds no state and needs no service round trip. AppFrame renders the center column conditionally: the conversation in code mode, the keyed `mode.page` slot (entryKey = the mode id) otherwise; details renders at a derived zero width while a non-code mode owns the center, with the stored preference untouched and restored on return.
- **`ui-app-modes` registers the rail** into the new `mode.rail` slot, one placeholder page per non-code mode into the keyed `mode.page` slot (its key is its mode id; the page receives the id through the registration's inject closure), and the sidebar-visibility preference row (`settings.general.item`, id `app-modes-sidebar`) into the settings General section. Mode glyphs are self-contained icons in two weights — outline for idle entries and pages, filled for the rail's active entry (the design-system icon set has no Work/Video/Image/App Store vocabulary).
- **The sidebar-visibility preference** (`ui-app-modes` settings namespace, `sidebarVisible`, default true; host registration in the plugin's node half) is applied as the boot default once the settings scope resolves, and live on row changes through `ctx.layout.setSidebarVisible` — a new `ILayout` face that maps hidden to the closed preference, i.e. the 56px control rail, the layout's recoverable minimum (a zero-width sidebar is the archived lockout bug). The mode rail stays visible in that state, so hiding the sidebar never hides the app switcher.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Rail inside the sidebar column | The collapsed 56px control rail cannot host a second 56px strip, so the collapsed state would need a redesign of the collapse animation and every rail slot |
| Full-viewport overlay placeholder pages (`shell.overlay`) | The overlay layer floats above the columns; a page must not cover the rail, and the rail highlight/click-through geometry would be hacked around the fixed layer |
| Mode state in a `ctx.appModes` service with the root inject binding a hook | The layout store is the one reactive channel AppFrame owns; a service would duplicate state or need store access the inject seam does not provide |
| Persisting the mode itself | The request was a sidebar-visibility preference; the mode is transient viewing state like the panel widths |

## Consequences

The GUI presents a WeChat-desktop-style left rail whose active entry follows the frame's mode state; switching to Work/Video/Image/App Store swaps the center column to a placeholder page and back to Code restores the conversation surface (its state lives in the runtime object layer). The sidebar-visibility row in General settings persists and applies the preference at boot and on change. Costs: every frame now reserves 56px for the rail (the concession chain nets it out); mode switching unmounts the conversation surface (remount restores it); the persisted preference is applied once at first scope acceptance, so a later settings-document change does not re-collapse an expanded sidebar until the row is toggled.

## Testing

`packages/client/ui-app-modes` covers the apply wiring (rail shell, five keyed entries, four keyed pages, row, boot default, teardown), the rail shell (ordered seat dispatch, active marking), the base entries (outline/filled glyph swap, click), the placeholder page, and the settings row (both switch states, writable gating) at the per-file 100% gate. `ui-knowledge` and `ui-assets` each cover their entry (idle/active/click) and page at the per-file 100% gate. `packages/client/ui-layout` pins the mode in the store, the four-track frame, the keyed page dispatch, the derived details zero, the rail owner props, and `setSidebarVisible` mapping. `apps/web/tests/app-modes.e2e.ts` (assembled keyless lane) renders the rail, switches every placeholder page, and restores the workbench; the existing assembled snapshots still pass with the new track.
