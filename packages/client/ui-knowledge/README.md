# @deepseek-ai/dsh-client-ui-knowledge

English | [中文](README.zh.md)

The Knowledge Base app mode as an independent module: its mode-rail entry and its center-column page. The rail shell (ui-app-modes) renders one keyed `mode.rail.entry` seat per mode id and hands each entry the live selection facts; this package registers the `knowledge` entry — glyph, copy, and chrome — and the `knowledge` placeholder page into the frame's keyed `mode.page` slot. The mode id joins the frame's `AppModeId` vocabulary in ui-layout; switching to it renders this page until the real Knowledge Base surface lands behind the same keyed seat.

Glyphs are self-contained in this package in two weights — outline for the idle entry and the page, filled for the rail's active entry — following the shared icon contract.

## Model Experience

None, as the package is human-only surface chrome; switching modes changes browser viewing state only, and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Placeholder page** — the Knowledge Base surface is a construction notice behind the same keyed `mode.page` seat; the real feature is future work in this module.
