# Agent Note: Markets mode page gains the Plugins tab and conversation-executed add flows

Status: implemented

English | [中文](2026-09-07-markets-mode-plugin-plugins-tab-and-add-flows.zh.md)

## Problem

The Markets mode plugin (`ui-sdkwork-markets`) landed its first surface: a keyed `mode.page` page whose header hosts category tabs. The Plugins category was missing from the tab set, and there was no entry point for either user story the market needs: creating a plugin through a guided, skill-driven conversation, and adding a third-party plugin market by recording its provenance. The full change (four tabs, add dropdown, entry dialog, page dispatch) was built once and then reverted by a later workspace change: the CSS modules, READMEs, the `markets` mode id in the frame's `AppModeId` union, and the bundle wiring (web-app patch manifest and dependencies, desktop dependencies, TypeScript paths) all disappeared while the TSX sources and behavior specs survived.

## Decision

The `markets` mode id joins the frame's `AppModeId` union (beside `drive`/`assets`), and the shared app header records its title (`mode.markets`) because its mode-title key map is an exhaustive record over non-code modes. The page header renders four category tabs with Plugins first; on the Plugins tab the header tools replace the inert my-catalog affordance with an add trigger whose menu carries the two flows:

- **Create plugin** dispatches a locale-owned creation prompt (`prompt.create`) through the page's `dispatchPrompt` injection, steering the agent to run its available plugin-creation skill.
- **Add plugin market** opens the entry dialog, which records the market provenance — source (GitHub `owner/repo`, Git URL, or local folder), optional Git ref, optional sparse-checkout path — and submits one composed prompt through the same dispatch.

`dispatchPrompt` is the single execution channel for both flows because the harness has no direct host market API yet: it switches the frame to the `code` mode, runs the shared New Session flow, waits (bounded, 15 s) for the list store to land a new current session, and sends the composed prompt as one queued text turn. When no session lands the frame stays on the conversation surface where the user acts directly. The page stays public (no IAM session face), the dialog falls back to locale-owned copy for blank ref/sparse fields, and every panel still renders an empty notice until each category's real catalog surface lands.

The revert repair is part of this note's scope: the four CSS modules were rebuilt from the built-bundle artifacts, and the wiring rows restored in the same places the sibling mode packages use (web-app `cordis.patch.yml` plugins and dependencies, `apps/desktop` dependencies, `tsconfig.base.json` paths), with `@deepseek-ai/dsh-client-ui-sdkwork-app-modes` declared as peer/dev dependency for the `ModeIconProps` type import.

## Alternatives considered

**Register a mode-rail entry.** Rejected: the markets surface is reachable through the sidebar quick entry (New Session area), and the rail stays the SDKWork primary module set; a rail entry can join later without contract changes.

**Persist market entries locally from the dialog.** Rejected: local persistence needs a service-owned store that no package currently provides, and the conversation channel keeps additions auditable in the session transcript; a direct API can replace the dispatch later without changing the form.

**Wire the create flow as a composer slash command.** Rejected for now: the slash pipeline exists, but the create flow needs a visible composed prompt and stays symmetric with the add-market flow; a command surface can layer on the same dispatch later.

## Consequences

Add-flow outcomes (success and failure) surface in the conversation transcript, not in page state. The Plugins add affordance only mounts on the Plugins tab; the other tabs keep the inert my-catalog button until account actions land. Future catalog surfaces land per category as their own providers without touching the header shell, and `MarketsPageInjected.dispatchPrompt` is the extension point they reuse for install-style actions.
