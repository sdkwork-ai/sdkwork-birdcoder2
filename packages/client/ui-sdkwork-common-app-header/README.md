---
description: "Shared app header for every non-code application mode: drag region, module title, keyed leading glyph seat, trailing actions, and the window-control footprint in the frameless desktop shell."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-common-app-header

English | [中文](README.zh.md)

## Summary


Shared app header for every non-code application mode. While the Code workspace keeps its session header inside [ui-conversation](../ui-conversation/README.md), all other center-column surfaces (video, image, app store, knowledge base, drive, assets, token plan, account, and placeholders) render beneath this bar. The header supplies a drag region for the frameless desktop shell, the active module title, an optional keyed leading glyph seat, additive trailing actions, and a window-control footprint so the floating cluster from [ui-sdkwork-window-controls](../ui-sdkwork-window-controls/README.md) no longer overlaps page content.

The frame declares the `shell.app-header` slot in [ui-layout](../ui-layout/README.md) and renders it above the keyed `mode.page` dispatch whenever the active mode is not `code`. This package occupies that seat.

Slot conventions: [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

## Table of Contents

- [Model experience](#model-experience)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model experience

None. The header renders module chrome only; nothing here enters model requests.

#### KV Cache impact

None; this package neither assembles nor sends provider requests.

## Known limitations and deferred work

- **Leading glyphs are opt-in**: modes may register into the keyed `shell.app-header.leading` seat; until they do, the bar shows the title alone.
- **Code mode is intentionally excluded**: the conversation session header continues to own that chrome.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The frame renders the `shell.app-header` slot (declared in ui-layout) only while the active mode is not `code`, and ui-conversation's session header keeps owning Code-mode chrome — do not route Code sessions through this bar. Leading glyphs are opt-in through the keyed `shell.app-header.leading` seat, and the bar reserves the window-control footprint so ui-sdkwork-window-controls' floating cluster never overlaps page content.

</details>
