---
description: "SDKWork Git Pull Request as an independent module: the Pull Request quick entry in the sidebar's New Session button area and its center-column placeholder page."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-git-pullrequest

English | [中文](README.zh.md)

## Summary

Pull Request as an independent module: its quick entry in the sidebar's New Session button area (`sidebar.actions`, declared by ui-sidebar) and its placeholder page keyed into the frame's `mode.page` slot by the `pull-request` mode id. The entry renders the branch glyph with its label in the wide column and the icon control in the collapsed rail, and switching to the mode rides the layout service's `setMode` — the same store channel the mode rail drives. The sidebar column stays mounted beside the page, so the quick-entry seat remains the way back. Glyphs, copy, and page live here, so the real Git-backed review surface can land in this module without touching the sidebar shell, the rail, or the frame.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only surface chrome; switching modes changes browser viewing state only, and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Placeholder page** — the Pull Request surface is a construction notice behind the same keyed `mode.page` seat; the Git-backed review feature is future work in this module.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The mode id joins the frame's `AppModeId` vocabulary in ui-layout, the shared app header resolves the mode title from its own table, and the frame keeps the sidebar mounted beside this mode — keep the id and the locale namespace (`pullRequest`) identical across the entry, the page, and those tables or they drift apart.

</details>

## Runtime invariants

No runtime invariant companion is published; the entry is a pure function of the seat's owner share, and the keyed page follows the frame's mode dispatch, covered directly by this package client behavior specs.
