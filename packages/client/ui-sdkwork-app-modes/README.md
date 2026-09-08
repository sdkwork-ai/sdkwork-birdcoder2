---
description: "App-mode surface plugin for the WeChat-desktop-style mode rail: the base mode entries, placeholder pages, the new-session hero's scene switcher, and the sidebar-visibility preference row over the ui-layout frame slots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-app-modes

English | [中文](README.zh.md)

## Summary


App-mode surface plugin: the WeChat-desktop-style mode rail shell, the base mode entries, the placeholder pages, the new-session hero's scene switcher, and the sidebar-visibility preference row. The frame's fixed leftmost track (`mode.rail`, declared by ui-layout) hosts the rail shell; the active mode lives in the layout store, so the frame hands it to the rail as owner props and the rail holds no state of its own. The shell renders one keyed `mode.rail.entry` seat per mode id in launcher order and passes each entry the live selection facts. This package contributes the base modes Code, Work, and Document; Video, Image, App Store, Knowledge Base, Drive, Assets, and Token Plan come from independent mode plugins. Clicking a non-code entry switches the frame's mode: the center column renders the keyed `mode.page` slot (entryKey = the mode id) instead of the conversation, and switching back to Code restores the conversation surface. The rail stays mounted in both sidebar states, so mode switching never depends on the sidebar being expanded. The rail's bottom also holds the settings trigger: the `mode.rail.settings` seat (declared by this package, occupied by ui-settings-general's trigger + modal panel) renders outside the entries group, so the settings button is not announced as an app mode, and it stays reachable while the sidebar is collapsed.

The plugin also stages the new-session hero's scene switcher: the pill group under the blank-session headline (`conversation.hero.modeSwitch`, a seat declared by ui-conversation) with the Code development, Media creation, and Document generation scenes. Clicking a pill stages the scene and keeps the conversation on screen; when the session's first message is submitted, the plugin's submission observer (a subscription to the current session's blank flip in the sessions list) consumes the staging and switches the frame to that scene's mode page through the rail's authenticated channel (`requestAuthenticatedMode`). A gated scene raises the sign-in overlay at staging time while signed out, and Code is the resting staging that never navigates.

The staged scene also picks the skill-tag strip docked BELOW the composer card (`conversation.composer.dock`, id `hero-scene-skills`, rendered by the hero card too): the tags stay fully expanded and wrap into centered rows, one tag per built-in skill of the scene, every skill a `birdcoder-*` SKILL.md package under the repository's `.agents/skills` project root (the open Agent Skills format: `name` + `description` frontmatter). Clicking a tag lands the same `/name ` literal a '/'-menu pick lands — through the session's public draft write in replace mode, so the draft always carries the one skill the strip last staged. The strip is New-Session-only: it renders during the blank phase and disappears the instant the conversation starts, so a live session never shows the scene tags. Placing the tags under the input card (instead of above it) keeps the composer's top toolbar clear of the tag affordances.

Work and Document use placeholder pages — a hero glyph, the mode name, and a construction notice with a hint back to the Code workbench. Code is the workbench itself and has no page entry.

The plugin also owns the sidebar-visibility preference: a General settings row (`settings.general.item`, id `app-modes-sidebar`) over the `ui-sdkwork-app-modes` settings namespace, bound through `ctx.settingsScope`. Turning the switch off persists the preference AND collapses the sidebar to its control rail immediately through `ctx.layout.setSidebarVisible`; the persisted value is re-applied as the boot default once the scope resolves. The mode rail stays visible in the collapsed state, so the sidebar's recoverable minimum never hides the app switcher. The host-side namespace registration lives in this package's node half.

Mode glyphs are self-contained icons in this package in two weights — outline for idle rail entries, placeholder pages, and idle scene pills, filled for the rail's active entry and the selected scene pill (the design-system icon set has no Work/Video/Document vocabulary); they follow the shared icon contract so swapping in library icons later is local.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only surface chrome and a settings preference. Switching modes changes browser viewing state only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Placeholder pages** — Work and Document render construction notices; their real surfaces remain independent future mode plugins behind the same keyed `mode.page` seat.
- **Boot default applies once** — the persisted sidebar preference is applied at the first scope acceptance; a later settings-document change does not re-collapse an expanded sidebar until the row is toggled.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The rail holds no state of its own: the active mode lives in the ui-layout store and reaches the rail as owner props, so mode state must never be duplicated here. The keyed `mode.rail.entry`, `mode.page`, and `mode.rail.settings` seats declared or occupied by this package, plus the `conversation.hero.modeSwitch` occupancy, are the mount contract every independent mode plugin, the settings trigger, and the hero switcher rely on — re-keying one is a cross-package change.

</details>

## Runtime invariants

No runtime invariant companion is published; the mode state lives in the layout store declared action set (the store spec is the write gate), the settings scope validates and publishes the durable section, and the rail active entry follows the same store channel AppFrame reads; store/mode agreement is covered directly by this package client and Host behavior specs.
