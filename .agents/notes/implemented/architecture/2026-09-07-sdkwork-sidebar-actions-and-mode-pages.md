# Agent Note: The sidebar actions seat and the automation/market pages render beside the sidebar

Status: implemented

English | [中文](2026-09-07-sdkwork-sidebar-actions-and-mode-pages.zh.md)

## Problem

The frame's sidebar column was code-mode-only (`sidebarVisible = panels.mode === 'code'`), and the sidebar's New Session control was a hardwired capsule with no extension point. The fork's product design replaces that button area with a stack of quick entries and renders the Automation and market pages in the center column while keeping the sidebar mounted — their quick entries live in that very column, so hiding it on switch left only the mode rail as the way back, and the pages themselves were placeholders (Automation) or unbuilt wiring (the market page's evolved surface: four category tabs plus add flows that dispatch a composed prompt into a fresh conversation).

## Decision

`ui-sidebar` swaps the hardwired capsule for the `sidebar.actions` list seat: the shell hands every entry the same injected `startSession` action it used to wire into the capsule plus the `wide` flag, and renders the built-in capsule only as the empty-list fallback, so a composition without registrants keeps the stock control and upstream merges cannot silently delete the affordance. The New Chat, App Store, Automation, and market plugins register into the seat (orders 10, 20, 30, and 40); the module entries open their page through `ctx.layout.openPanel`, which leaves the rail selection on `code` while the sidebar stays mounted, and the App Store entry writes `ctx.layout.setMode('appstore')` because that mode is a full-bleed surface the rail selects too. The Pull Request row is disabled in the composition, so neither its quick entry nor its keyed placeholder page is mounted.

`ui-layout` gains the `automation` and `markets` mode ids, and `AppFrame` keeps the sidebar column mounted for exactly those two non-code modes (`codeMode` still gates the details column, which a mode page owns without a side panel); every other non-code mode keeps the hidden-sidebar behavior. `ui-sdkwork-common-app-header` resolves the new modes' titles (and the previously missing `course` row). The Automation page (`ui-sdkwork-automation`) is the fork's own scheduled-task surface: a top tab bar, the first-task empty state whose add affordance opens the add-task dialog that creates the task through a composed `schedule_create` request, the task list with its status filter and search field, and a static twelve-card template catalog ([the Automation task surface](2026-09-30-sdkwork-automation-task-surface.md)). The market page (`ui-sdkwork-markets`) hosts the four category tabs (Plugins, Experts, Skills, Connectors), a per-category search field, the my-catalog affordance on the non-Plugins tabs (inert until its account actions land), and on the Plugins tab the add affordance whose create-plugin and add-market flows compose a prompt from locale copy, run the shared New Session flow, and send it into the fresh session (bounded by a dispatch timeout). The page stays public — `markets` remains outside `ui-sdkwork-iam`'s gated set per [the public-markets note](2026-09-06-sdkwork-markets-public-mode.md).

## Alternatives considered

**Routing the entries through the mode rail.** The rail is the persistent icon column, but the design names the sidebar's button area as the entry region, and a rail action seat would have grown the rail shell contract for a sidebar-scoped need.

**Keeping the sidebar code-only and relying on the rail's Code entry.** The quick entries would remain one-way switches and the two pages full-bleed dead ends — exactly the flow the design rejects. Widening the sidebar-visible set to every mode was equally wrong: the generative and store surfaces are full-bleed embedded SDK surfaces with their own geometry.

**Wiring the add affordances to guessed actions.** No task seam or catalog existed when this decision was taken, so any wiring would have been invented behavior; the inert rendering kept the affordances visible without faking capability, while the market's two plugin flows reuse the real shared session channel. The Schedule capability and this page's own catalog landed later ([the Automation task surface](2026-09-30-sdkwork-automation-task-surface.md)).

## Consequences

Switching to Automation or the market keeps the session sidebar, the quick-entry stack, and the sidebar drag handle; the pages render to the column's right, and the seat stays the way back. The App Store entry is the one quick entry that leaves the code surface outright: the frame drops the sidebar column and the rail lights its own App Store entry. Coverage pins the set and the chrome: `ui-sidebar`'s fallback capsule (empty seat) and `ui-layout`'s app-frame spec (sidebar mounted, tracks, and handle for both modes), plus each package's page/action/apply specs. Snapshot pins: `sidebar-snapshot.client.spec.tsx` (the fallback capsule keeps the shell's snapshot stable with no registrants), `automation-page.client.spec.tsx` (tabs, empty states, the task list with its in-place delete confirmation, twelve cards), and `markets-page.client.spec.tsx` (four tabs, tools, add flows).
