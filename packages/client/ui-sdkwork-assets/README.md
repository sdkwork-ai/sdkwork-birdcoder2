---
description: "Assets app mode as an independent module: the assets mode-rail entry and its center-column placeholder page registered into the frame's keyed slots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-assets

English | [中文](README.zh.md)

## Summary


The Assets app mode as an independent module: its mode-rail entry and its center-column page. The rail shell (ui-sdkwork-app-modes) renders one keyed `mode.rail.entry` seat per mode id and hands each entry the live selection facts; this package registers the `assets` entry — glyph, copy, and chrome — and the `assets` placeholder page into the frame's keyed `mode.page` slot. The mode id joins the frame's `AppModeId` vocabulary in ui-layout; switching to it renders this page until the real Assets surface lands behind the same keyed seat.

Glyphs are self-contained in this package in two weights — outline for the idle entry and the page, filled for the rail's active entry — following the shared icon contract.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only surface chrome; switching modes changes browser viewing state only, and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Placeholder page** — the Assets surface is a construction notice behind the same keyed `mode.page` seat; the real feature is future work in this module.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The rail shell (ui-sdkwork-app-modes) owns selection; this package only registers the keyed `assets` entries into `mode.rail.entry` and `mode.page`, and ui-sdkwork-generations-assets shadows them at a lower priority — keep the mode id and keys identical across all three packages or the placeholder and the real surface drift apart.

</details>
