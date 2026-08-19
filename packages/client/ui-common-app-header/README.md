# @deepseek-ai/dsh-client-ui-common-app-header

[中文](README.zh.md) | English

Shared app header for every non-code application mode. While the Code workspace keeps its session header inside [ui-conversation](../ui-conversation/README.md), all other center-column surfaces (video, image, app store, knowledge base, drive, assets, token plan, account, and placeholders) render beneath this bar. The header supplies a drag region for the frameless desktop shell, the active module title, an optional keyed leading glyph seat, additive trailing actions, and a window-control footprint so the floating cluster from [ui-window-controls](../ui-window-controls/README.md) no longer overlaps page content.

The frame declares the `shell.app-header` slot in [ui-layout](../ui-layout/README.md) and renders it above the keyed `mode.page` dispatch whenever the active mode is not `code`. This package occupies that seat.

Slot conventions: [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

## Model experience

None. The header renders module chrome only; nothing here enters model requests.

#### KV Cache impact

None; this package neither assembles nor sends provider requests.

## Known limitations and deferred work

- **Leading glyphs are opt-in**: modes may register into the keyed `shell.app-header.leading` seat; until they do, the bar shows the title alone.
- **Code mode is intentionally excluded**: the conversation session header continues to own that chrome.
