---
description: "SDKWork Automation as an independent module: the Automation quick entry in the sidebar's New Session button area and its center-column page with the scheduled-tasks and run-history views."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-automation

English | [中文](README.zh.md)

## Summary

Automation as an independent module: its quick entry in the sidebar's New Session button area (`sidebar.actions`, declared by ui-sidebar) and its page keyed into the frame's `mode.page` slot by the `automation` mode id. The entry renders the clock glyph with its label in the wide column and the icon control in the collapsed rail, and switching to the mode rides the layout service's `setMode` — the same store channel the mode rail drives. The page carries the scheduled-tasks and run-history views behind a top tab bar: the scheduled view holds the first-task empty state with the add affordance plus the static template catalog (twelve seeded automation ideas), and the runs view holds its own empty state. The frame keeps the sidebar column mounted beside the page — the mode's quick entry lives there — and the glyphs, copy, and page all live in this module, so the real scheduled/triggered task capability lands here without touching the sidebar shell, the rail, or the frame.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only surface chrome; switching modes and browsing templates change browser viewing state only, and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **No task capability yet** — task creation and run records have no backing seam, so the add affordance renders inert (`aria-disabled` with the construction reason) and the runs view shows an empty state; the scheduled/triggered task feature is future work in this module.
- **Static template catalog** — the twelve template cards are presentation-only copy in this package; wiring a template into real task creation is future work.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The mode id joins the frame's `AppModeId` vocabulary in ui-layout, and the shared app header resolves the mode title from its own table — keep the id and the locale namespace (`automation`) identical across the entry, the page, and that table or they drift apart. The sidebar column stays mounted for this mode by the frame's sidebar-visible mode set (ui-layout's `AppFrame`), not by this package.

</details>

## Runtime invariants

No runtime invariant companion is published; the entry is a pure function of the seat's owner share, and the keyed page follows the frame's mode dispatch, covered directly by this package client behavior specs.
