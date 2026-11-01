# Agent Note: The Skills tab draws the SkillHub market in place

Status: implemented

English | [中文](2026-11-01-skills-tab-embeds-skill-market.zh.md)

## Problem

The Skills tab of the Markets page carried the SkillHub community market as a hand-over: a card describing the market and one button that selected the skill-market plugin's `main` panel, which replaced the center column with the market's own page. That arrangement was chosen when the market was a read-only third-party package that registered a full-page panel and published no client control ([built-in SkillHub skill market](2026-11-01-built-in-skill-market-plugin.md)).

Two product costs came out of it. The market became a second page to navigate to, so the tab that exists to find skills did not itself contain any. And the plugin's own sidebar row stayed in the column next to the tab, so the same catalog had two navigation entries — one of them sitting under the demand-hall quick entries, where nobody looks for skills. The plugin still registers both the panel and the row, and the row can only be removed by the surface that owns the panel's navigation.

## Decision

The Skills tab renders the registered panel itself, and the plugin's sidebar row is suppressed.

### The panel crosses the package boundary through the ledger

`packages/client/ui-sdkwork-markets/src/client/skillMarketPanel.ts` already watched the `main` ledger for the `skill-market` key to know whether navigation would work. The entry it finds carries the plugin's component, so the same source now publishes `{ component }` in one reference-stable object: a fresh object per read would remount the market after every unrelated panel registration.

`SkillMarketSurface.tsx` draws that component inside `[data-skill-market-embedded]` — a flex box with a definite height, because the panel sizes itself to `height: 100%` and scrolls its own card grid — or the unavailable notice when no panel is registered (the plugin row is off, or its browser half has not loaded). Rendering it outside its declared seat is safe only because the market's panel takes no slot props: it keeps its state locally and talks to its Host half over the same-origin `/skill-market/api/*` prefix, both facts about the shipped artifact rather than about a contract this repository controls.

Nothing of the market is copied: no catalog, no detail drawer, no install pipeline. The submodule stays unmodified.

### One navigation entry

`ctx.sdkworkSidebar` — the fork sidebar's registry — gains `suppressPanel(panelId)`. The column's `sidebar.panellist` rows are a projection the sidebar owns, so the surface that embeds a panel declares the panel's row embedded there, and the projection leaves the row out. The declaration is an owned Cordis effect: unloading the markets plugin restores the row.

The markets plugin consumes the service optionally (`ctx.inject(['sdkworkSidebar'], …)`), like the Plugin Market's `market` control: a composition without the fork column has no panel list to filter and must not fail to activate.

The row-list rule matches the one the column already applies to a panel the mode rail exposes as a shortcut: another surface is that panel's navigation entry. Its authority is now a declaration instead of a second seat.

### The remaining doors

The Skills sub-tab strip keeps both chips, with the market leading and the cloud catalog beside it. The skills add menu's market row no longer leaves the page: it switches to the market chip, and it exists only while the panel is registered. The hand-over copy (`skills.market.open`, `skills.market.cloud`, the capability lines, and the attribution footer) is gone; the notice for a deployment without the market remains.

The market stays selectable as a `main` panel. No product surface navigates to it any more, and the layout does not persist panel selection across launches, so it cannot reappear as an orphan page.

## Alternatives considered

**Fork or patch the submodule to publish a render control** — the `dshmarket` shape (`ctx.market.render()`), which would let the tab call the market instead of reading its registration. It remains the wrong price: the package is a read-only submodule with a committed build, so every upstream release would become a merge. Reading the registration already gives the same component without asking the package for anything.

**A fork-owned wrapper that reimplements the market surface** — duplicate the catalog, detail drawer, install pipeline and persistence in this repository, then track every upstream release by hand. Still rejected for the reason the market is not vendored.

**Re-declaring `main` so the page can call `renderSlot`** — impossible by design: a slot has exactly one declarer and the layout owns `main`; a second children table is a load failure. Rendering the registered component is the only route that keeps the layout's ownership intact.

**Registering a hidden `mode.rail.panel` entry to reuse the existing row filter** — the column already drops a panel whose id appears in the rail's shortcut seat, so a component that rendered nothing would produce the same filtered row without touching the sidebar package. It asserts a rail shortcut the product does not have, and any future chrome around that seat would surface an empty control.

**Hard-coding the `skill-market` id in the sidebar** — the cheapest filter, and the wrong owner: the column would carry knowledge of one downstream product surface, and the next embedding plugin would edit it again.

## Consequences

The Skills tab is now the market: browsing, search, install, installed/imported management, and the market's own favorites all happen where a person looks for skills, and the catalog has exactly one entry. The plugin keeps its `main` registration, so its panel is still selectable by any surface that would want it.

The coupling is one string and one shape, both soft. The panel key is already pinned by `packages/bundle/web-app/tests/built-in-skill-market.spec.ts`, so a rename fails a spec rather than the tab. The panel ignoring slot props is not pinned anywhere: a future release that starts reading a slot seat would render without them when drawn from this tab. Manual verification against the pinned artifact is the only gate for that, and it is recorded here rather than hidden; the recovery is to move the panel back behind navigation, which the previous design still describes.

Suppression is per composition, not per deployment configuration: a deployment that wants the market's stand-alone page must not rely on the plugin's row while this plugin's page is mounted.
