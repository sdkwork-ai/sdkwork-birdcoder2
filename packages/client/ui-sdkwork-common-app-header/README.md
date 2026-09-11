---
description: "Names the active non-code mode in the window chrome the shell already renders: the seat that projects the module title onto the page title the desktop title bar and the browser tab read."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-common-app-header

English | [中文](README.zh.md)

## Summary

Every non-code application mode — video, image, app store, knowledge base, courses, drive, assets, scheduled tasks, marketplace, account, Token Plan, and the Work/Document placeholders — names itself in the chrome the shell already draws: the desktop's native title bar, the browser tab on the web. Switching modes retitles the window; leaving a mode restores the product name. Code mode is untouched, because the Session title already names the window there. One projection serves both compositions, with no in-page bar to keep in sync.

## Table of Contents

- [Runtime invariants](#runtime-invariants)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime invariants

No runtime invariant companion is published; it is a pure presentation plugin — it emits no cordis events and owns no cross-plugin mutable state. The component specs assert the title write, the release on unmount, and the mode-to-key roster; the plugin spec asserts the registration, its dictionary namespace, and that the host entry stays inert.

The frame declares the `shell.window-title` seat in [ui-layout](../ui-layout/README.md) and renders it above the keyed `mode.page` dispatch whenever the active mode is not `code`; the seat receives the active mode and the product title. This package occupies that seat with a projection that renders no elements and writes `document.title` as `{module} — {product}`, releasing the bare product title on unmount.

Slot conventions: [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

## Model Experience

None, as the package only writes the host window's title and registers nothing model-facing.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

The projection follows the frame, so it names whatever mode the center column is showing and nothing else.

- **Every mode id needs a roster row and a dictionary row**: `MODE_TITLE_KEYS` is a `Record` over the `AppModeId` union minus `code`, and `AppHeaderKey` is derived from the `appHeader` dictionary, so a new mode id fails this package's typecheck until both gain their row — there is no runtime fallback title.
- **Code mode is intentionally excluded**: the frame does not render this seat while the conversation surface owns the center column, because the Session title already names the window there.
- **A mode page that nests its own document viewer does not retitle the window**: the projection follows the frame's mode, not the nested surface.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The frame mounts this seat for non-code modes and ui-layout's own browser-title projection for code mode, never both: a mode switch unmounts one before the other's effect runs, so the two never fight over `document.title`. The seat is a null-rendering projection in the frame's center column — the same shape as ui-layout's DocumentTitle — which keeps the mode-to-title copy with the feature that owns it instead of pushing a locale dependency into the frame.

The package name is the one this contract outgrew: it owned the copy of an in-page header the shell no longer draws.

</details>
