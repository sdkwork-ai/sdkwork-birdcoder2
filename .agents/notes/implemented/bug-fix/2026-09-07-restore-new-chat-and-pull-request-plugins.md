# Agent Note: Restore the deleted New Chat and Pull Request sidebar plugins

Status: implemented

English | [中文](2026-09-07-restore-new-chat-and-pull-request-plugins.zh.md)

## Problem

A later workspace change deleted the `ui-sdkwork-new-chat` and `ui-sdkwork-git-pullrequest` packages (source, tests, READMEs) together with their wiring rows — the two sidebar quick entries that lead the `sidebar.actions` seat were gone while the Automation and market plugins that reference them stayed: `ui-sdkwork-automation`'s registration still read "Behind Pull Request, ahead of the market entry", and the frame's `AppModeId` no longer carried `pull-request`, leaving the Pull Request feature without its mode, entry, page, or header title.

## Decision

Rebuild both packages against the current conventions (the evolved Automation package is the structural template) and restore every wiring row in the places the sibling mode packages use:

- `ui-sdkwork-new-chat` registers `sidebar.actions` id `sdkwork-new-chat` at order 10, riding the shell's shared New Session action (same flow as the fallback capsule).
- `ui-sdkwork-git-pullrequest` registers `sidebar.actions` id `sdkwork-git-pullrequest` at order 20 (switching through `ctx.layout.setMode('pull-request')`) and the `mode.page` entry keyed `pull-request` with its placeholder page.
- `pull-request` rejoins ui-layout's `AppModeId` union, the shared app header's exhaustive mode-title map (plus its zh/en dictionaries), and the frame's sidebar-mounted mode set in `AppFrame` (the page renders beside the sidebar whose seat is the way back), with the app-frame spec's sidebar-set test extended to the three modes.
- Wiring rows restored in `tsconfig.base.json` paths, the `tsconfig.client.json` references (also adding the missing `ui-sdkwork-automation` row), `packages/bundle/web-app` dependencies and `cordis.patch.yml` plugins, and `apps/desktop` dependencies.

The mode stays ungated: neither package carries an IAM dependency, matching the automation precedent.

## Alternatives considered

**Keeping the Automation-only seat and dropping the New Chat plugin.** The new-conversation entry is the seat's lead capability and the product design's replacement for the sidebar capsule trigger; the fallback capsule is not a substitute entry.

**Re-adding only the mode and page without the sidebar entries.** The quick entries are the design's only navigation into these surfaces (no rail entry), so an entry-less mode would be unreachable from the UI.

## Consequences

The sidebar quick-entry stack renders New Chat, Pull Request, Automation, and the market in order; switching to Pull Request keeps the sidebar mounted beside the placeholder page and the header title resolves. Coverage: the rebuilt packages' apply/action/page specs, ui-layout's app-frame spec (three sidebar-mounted modes), and the automation/markets specs unchanged. Snapshot pins: sidebar snapshots are untouched because the seat renders registrants' own chrome and the fallback-capsule case still matches.
