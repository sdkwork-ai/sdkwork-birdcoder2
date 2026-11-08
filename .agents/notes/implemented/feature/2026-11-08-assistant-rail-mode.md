# Agent Note: The Bot team as a rail mode below Home

Status: implemented

English | [中文](2026-11-08-assistant-rail-mode.zh.md)

## Problem

The Bot team (`ds-bot`) could be installed into this fork but not composed by it,
and its surface had no navigation entry of its own. DS Bot is a shell skin: in
Bot mode its browser half shadows the sidebar and the conversation cells of the
Session the frame is showing, and its own store is the only writer of that
surface choice — its "return to DSH" control is the only way back. A shipped
build therefore offered no 助理 entry, and installing the plugin alone left the
rail unchanged with a second, plugin-owned surface preference underneath.

The rail itself could not receive the entry from a plugin: `ui-sdkwork-app-modes`
filters registered keys through a closed vocabulary (`CUSTOMIZABLE_MODES`), and
`ui-layout`'s `AppModeId` union decides how the center column renders. An entry
outside that vocabulary never renders.

## Decision

The Bot team ships as a first-class app mode: the submodule
`plugins/sdkwork-dsh-bot`, one `sdkwork-bot` row in the web-app patch, a new
`assistant` mode in the frame vocabulary directly below `code`, and a fork-owned
rail package (`packages/client/ui-sdkwork-assistant`) that owns the 助理 entry and
binds it to the plugin's surface.

### Composition

`packages/bundle/web-app/cordis.patch.yml` carries two rows: `ui-sdkwork-assistant`
(the rail entry and the binding) and `sdkwork-bot` (`name: ds-bot`). The plugin's
own `dsh.bundle.patch` is deliberately not added to the profile's bundle list —
the row is the single mount — and its `web-search-auto` row is not carried
either: the profile's configured search provider stays authoritative, so the
Bot team's `web_search` uses it like every other surface.

### `assistant` is a shell mode, not a page

`AppModeId` gains `assistant`, and `AppFrame` treats it as a shell mode beside
`code`: the center column keeps the `main` panel (the Session conversation), the
left column stays visible (it is where the Bot team's sidebar lives), the right
column keeps its track, and the Session title keeps the window title. A keyed
`mode.page` page would have hidden the sidebar — the exact column the Bot team
paints — and could not have contained a surface that is a skin of the
conversation rather than a page beside it.

`ui-sdkwork-app-modes` adds `assistant` to `MODE_ORDER` directly after `code` and
to `FIXED_MODES`, so the shipped layout shows it and the customize dialog cannot
hide it. The vocabulary entry exists unconditionally; the *seat* exists only
while the rail package is composed. A deployment that drops the plugin shows
neither the seat nor the dialog row.

### The surface seam

Upstream exposes its surface only through its own controls, so the plugin gains
one public extension point: `ctx.botSurface`, an observable holding `bot` or
`agent` plus a `set(mode)` that runs the same action every internal control
runs. The rail package injects it optionally; while it is absent the package
contributes no entry and forces no surface, so a composition without the plugin
neither shows a dead icon nor traps the frame on a surface it cannot leave.

The package reconciles both directions with idempotent writes: the 助理 mode
wants the Bot surface, every other mode wants the agent surface, and a surface
change writes the matching mode. Whichever side moved, the two settle in one
step — the rail, or the plugin's own return control. At mount the frame is on
Home, so a remembered Bot surface is withdrawn in the same step the plugin
mounts; the 助理 entry is an explicit choice, not a landing state.

`ctx.layout.mode` is the other half of the seam: the layout service now publishes
the rail selection as a subscribable source beside `panelInfo`, so a surface
plugin follows the rail without owning the rail's store or reading the frame's
DOM.

### The plugin edit and its build

The `ctx.botSurface` addition is the only change to the submodule: it lives on
the plugin repository's `feat/assistant-rail-surface` branch
(`ds-bot/src/client/index.js`, commit `79bc7b0`) and its committed artifact
(`ds-bot/client.js`) is rebuilt with the plugin's own build. The branch is
pushed, so a CI checkout resolves the gitlink; merging it into the fork's `main`
and moving the pin is the release step. The change carries no rail or 助理
vocabulary, so it is upstream-able to DS Bot unchanged.

The artifact is built from a flat `npm ci` install, not from the workspace's pnpm
layout: the bundle carries source-region comments derived from module paths, and
a pnpm store layout rewrites thousands of comment lines while the code stays
identical. `plugins/README.md` records the procedure.

## Alternatives considered

**A keyed `mode.page` page that draws the Bot team** — the Bot team is not a page.
Its sidebar, its conversation cells and its composer are shadowed slots of the
Session the frame already shows; a page beside the conversation would render an
empty center column with a hidden sidebar, and every slot it needs would have to
be re-implemented here.

**Writing the plugin's `localStorage` preference from the rail entry** — that key
is read once at plugin mount and the plugin subscribes to its own store, not to
`storage` events. A write would be invisible until a reload, and the plugin's own
return control would disagree with the rail until then.

**Making the entry a `mode.rail.panel` shortcut** — that seat is the bottom
cluster above Settings. The requested position is directly below Home, inside the
top group, and that group renders mode entries only.

**Hardcoding the mode id inside the plugin** — the plugin would learn a
fork-specific vocabulary and its own rail assumptions. The service seam keeps the
plugin generic: a host either injects `ctx.botSurface` or does not.

**An entry owned by `ui-sdkwork-app-modes`** — the icon would render in every
deployment, including those without the Bot plugin, and select a mode whose
surface does not exist. Ownership sits with the package that can also gate on the
service.

## Consequences

A shipped build now offers the Bot team as the 助理 entry directly below Home,
with the Bot data still under `$DSH_HOME`. Both surfaces have a rail entry, and
either one's own controls move the other.

The cost is a soft contract with a third-party artifact plus a fork-local plugin
commit: a rename of `ctx.botSurface` fails the bundle acceptance spec (and, before
that, silently hides the entry), and the submodule now carries a commit that does
not exist upstream until it is pushed. This repository's rule that `plugins/*` is
read-only is therefore bent for exactly one additive, generic service; the note
and `plugins/README.md` record it, and a future pin bump must keep the service or
update both sides together.

The Bot team starts withdrawn, so a deployment that wants it as the landing
surface must change the frame's default mode, not this package. The entry is
fixed in the rail: a user who does not want it can only drop the plugin row. In
Bot mode the plugin's own fixed left column covers the frame's left edge, so the
rail is not visible while the assistant surface is active; the rail returns with
the agent surface, through the plugin's Settings switch control.

An arrangement written before the entry existed would have shown it at the end of
the rail, because the layout store appends a mode the stored order lacks. A
shipped-order revision (`dsh.railLayoutOrderRevision`, `RAIL_ORDER_REVISION`) moves
it below Home once; a later reorder is the user's and survives.
