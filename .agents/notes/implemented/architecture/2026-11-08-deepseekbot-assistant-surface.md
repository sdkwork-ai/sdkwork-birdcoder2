# Agent Note: The persona-bot plugin ships as a pinned npm closure and the assistant owns the rail cell

Status: implemented

English | [中文](2026-11-08-deepseekbot-assistant-surface.zh.md)

## Problem

The fork's mode rail offers Home, the generation modes, the App Store, Knowledge Base, Courses, Drive, Assets, Search and Token Plan. None of them reaches the persona-bot layer (DeepSeekBot, renamed Tobs by its upstream): the third-party plugin that gives agents persistent identity, memory and messaging. Upstream publishes it as a DeepSeek Harness bundle, but the repository the product asked this fork to integrate — the `sdkwork-ai/sdkwork-deepseekbot` mirror of `BotHarness/DeepSeekBot` — commits neither the host half's `dist/` nor the browser half's `lib/`, and its own workspace pulls Expo and React Native packages. This repository's `plugins/*` pattern assumes a submodule that already ships runnable artifacts, so it cannot carry this plugin.

The plugin also publishes no panel-rendering service. Its browser half registers its whole interface as one keyed `main` panel (`botharness`) plus a `sidebar.panellist` row, and swaps the left column for its own Bot-mode sidebar through a `sidebar` shadow while that panel is selected. A host that wanted the surface anywhere else would have to copy its component tree or re-register its slots, which the third-party read-only rule forbids.

## Decision

**The plugin is installed as its published npm closure.** `packages/bundle/web-app/package.json` pins `deepseekbot`, `@botharness/core` and `@botharness/ui` at `1.6.1` — the same practice `dshmarket` uses — and `cordis.patch.yml` mounts `botharness-core` (Bot registry, memory repositories, `/api/botharness/*` routes, bot session driver, `agentPreset: deepseekbot`), `botharness-client` (the browser half) and `preset-deepseekbot` (the plugin's generated agent preset). The plugin's own `dsh.bundle.patch` stays out of the profile's bundle list, exactly as for the submodule plugins. Nothing in this repository rebuilds, patches or re-vendors it; a pin bump is a `pnpm install` plus the bundle's acceptance spec.

**The assistant rail cell belongs to a fork package.** `packages/client/ui-sdkwork-assistant` registers one keyed `mode.rail.entry` under the new `assistant` mode id, second in the rail order (directly below Home) and in the fixed, unhideable set. The cell carries the product copy 助理 / Assistant and a robot-head glyph, and it opens the surface by selecting the plugin's panel through `ctx.layout.selectPanel('botharness')` — the same navigation the plugin's own sidebar row uses. The plugin's interface, sidebar shadow and settings section remain its own registrations.

**The left column's entry is the sidebar's own quick-entry seat.** The same package registers one `sidebar.actions` entry (id `sdkwork-assistant`, order 35, directly after the scheduled-tasks entry) rendering the same robot glyph at the seat's 16/18px sizes with the 助理 label, no artwork background and no badge — the geometry, hover treatment and copy placement of the scheduled-tasks entry beside it. The plugin's own `sidebar.panellist` row, drawn with its avatar artwork and "试试看" onboarding badge, is suppressed through `ctx.sdkworkSidebar.suppressPanel('botharness')`, so each column keeps exactly one entry to the surface. The suppression follows the sidebar service, so a profile without that column still gets the rail cell, and unloading this package restores the plugin's row.

**The cell follows the panel, not the rail.** `assistant` never becomes the frame's mode: the frame renders a selected main panel inside the code surface, so the mode stays `code` and the rail's mode cells would otherwise keep Home lit. The cell therefore paints its selection from `usePanelInfo` (the panel selection), and `ModeRail` passes `active: false` to every mode cell while a main panel is selected. The cell's registration is gated on the `botharness` main-panel entry: a profile that disables the plugin's rows gets no dead icon, and a plugin teardown removes the cell with its panel.

**A stored rail layout adopts the new mode beside Home.** `normalizeLayout` now places every mode missing from a stored order directly after the nearest preceding shipped mode the order already carries, instead of appending it. An existing user's rail therefore shows the assistant cell where the product ships it rather than at the end of the rail.

## Alternatives considered

**A `plugins/` git submodule.** The repository's read-only submodule pattern is the default for third-party plugins. It cannot work here: the mirror's `dist/` and `lib/` are gitignored, so a submodule checkout provides sources no `dsh` row can load, and building the plugin's own workspace (Expo, React Native, Sharp) is not this repository's build.

**A mode page that renders the plugin.** A `mode.page` for `assistant` could carry the whole center column with its own chrome. It cannot mount the plugin's interface: the plugin publishes no `render()`-style service (unlike `@xmanrui/dsh-im`, whose `dshImClient` the IM connector page follows), and re-registering its slots or copying its components would make this repository a fork of its interface.

**Reusing an existing mode id for the cell.** Registering the cell under an existing mode (Search, Assets, …) would avoid the `AppModeId` change. It hijacks an unrelated icon's selection and page, and the customize dialog would name the wrong surface.

**A `mode.rail.panel` shortcut above Settings.** That is where the IM connector lives and it is a supported seat. The product asked for the cell directly below Home, so it has to live in the mode group.

**Mounting the plugin's Browser and Computer rows too.** `@botharness/browser` and `@botharness/computer` are optional capability rows with native dependencies (`sharp`, a bundled browser runtime). They are not mounted; a deployment that wants them adds the rows and their dependencies in a later patch layer.

## Consequences

- The assistant surface is navigable from both columns by default in a shipped build: the rail cell below Home and the sidebar quick entry after 定时任务. The plugin's own "Bot 模式" row is suppressed rather than restyled, so the plugin's bundle stays untouched and its row returns if this package is removed.
- The plugin's pin is a release version rather than a gitlink, so an upstream release is adopted by editing one dependency and running `pnpm install`; the bundle's acceptance spec then proves the manifests, the browser half and the preset helper still resolve and exist.
- The agent preset is copied into the fork's patch, because a preset row composes plugins by name. A plugin release that changes that composition needs the patch row re-synced by hand; the acceptance spec only checks the preset row's package.
- The assistant cell is fixed: the customize dialog can reorder it and cannot hide it, so the product's headline assistant entry cannot disappear from the rail.
- While the assistant panel is open no mode cell is lit, because a main panel is not an app mode. That is the same presentation the sidebar-launched panels already had, now stated in one place in the rail.

## Testing

`packages/bundle/web-app/tests/built-in-assistant.spec.ts` asserts the four composed rows, the pinned bundle dependencies, both plugin manifests' browser declarations, the built host half, browser half and preset helper, and rejects each incomplete form. `packages/client/ui-sdkwork-assistant/tests` covers both entries' registration lifetime, their click navigation, the rail cell's panel-driven selection, the sidebar row's copy and artwork-free layout, the plugin-row suppression, and both entries' copy. `packages/client/ui-sdkwork-app-modes/tests` covers the new rail order, the fixed set, the panel-aware selection and the neighbor-aware adoption of a stored layout.
