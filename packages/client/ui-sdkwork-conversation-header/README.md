---
description: "SDKWork conversation header plugin: replaces the conversation session header body with a single-row layout whose View navigation is an icon+label segmented control centered in the header row."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-conversation-header

English | [中文](README.zh.md)

## Summary

This plugin redesigns the conversation session header for SDKWork. The upstream header renders a title row (breadcrumbs + actions + utilities) followed by a full-width View tabs strip ("Chat" / "Trajectory") below it — a whole row spent on two labels. This plugin claims the `conversation.session.header.surface` seat declared by `ui-conversation` and replaces the header body with a single row:

1. Left: the breadcrumb cluster (session ancestry), then the action strip.
2. Center: an icon+label segmented control for the View navigation — the former tabs strip becomes a compact control that saves one header row.
3. Right: the utility cluster.

The upstream body stays mounted as the fallback: without this plugin (or with the plugin disabled) the header renders exactly as before.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

Mount the plugin as part of the web-app bundle (a roster row in `packages/bundle/web-app/cordis.patch.yml` plus the workspace dependency in the web-app and desktop manifests). Once the plugin activates, the conversation header renders in the single-row layout. Removing the roster row restores the upstream two-row header.

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/client/index.ts` — registers the dictionaries and claims the `conversation.session.header.surface` seat through the deferred `slots.inject`.
- `src/client/ConversationHeader.tsx` — the surface component. It is a pure function of the owner share handed down by the upstream header entry (child dispatchers, navigation callbacks, breadcrumb chain, View roster, active View id); it renders the breadcrumbs, the centered segmented control (`role="tablist"`, lucide glyphs for known View ids), and the action/utility seats.
- `src/client/ConversationHeader.module.css` — the three-zone grid (`1fr auto 1fr`) that keeps the segmented control truly centered at every column width, styled with the shared DSW alias tokens.
- `src/client/locales.ts` — the plugin-owned `sdkworkConversationHeader` namespace (aria labels).

The upstream header entry keeps the `<header>` shell, blank-session hiding, and the View selection store; the plugin owns presentation only and never touches cross-plugin mutable state.

### Seat ownership (merge-stable contract)

The `conversation.session.header.surface` seat owns the **whole** header body, including the View tabs strip. The upstream shell renders no View navigation of its own — its tabs strip lives inside the seat's fallback body, so a claimer replaces it rather than sitting beside it. Two surfaces belong to the shell and must never be rendered here:

- **The View tabs strip** — the shell's fallback body renders it; this plugin renders the segmented control that replaces it. Rendering both is the 2026-09-18 regression: a live session showed two tab strips (`[role="tablist"]` count 2), one above the other.
- **The far-right corner** (`conversation.session.header.corner`) — a shell seat kept mounted through every phase, including the blank/hero phase where the shell hides the seat body entirely. A copy here would both double the control in live sessions and lose it in the hero.

The invariant is asserted as counts in one assembled DOM by `tests/header-seat-assembly.client.spec.tsx`, which mounts the real shell with the real plugin; both halves of the regression were verified to fail that suite (mutants killed) before landing.

### Row width and adaptivity

The seat outlet's anchor carries `display: contents`, so it generates no box and can never be a flex item — the shell puts `flex: 1` on the anchor's **children**, not the anchor. The body therefore owns the full width the fixed-width leading seat and the corner leave, and its grid divides it:

- `minmax(0, 1fr) auto minmax(0, 1fr)` keeps the segmented control in the true middle and the utilities against the right edge at every width.
- The `minmax(0, …)` (not bare `1fr`) is what makes the row **adaptive**: when the right panel toggles, the app frame narrows the centre column, and these tracks shrink below their content instead of overflowing. Without the 0 minimum a grid track floors at its content's min-content width and the row spills out of the column.

Measured in real Chrome (1440/1100/900/700/520 px stages) the body fills the row exactly at every width, the control stays centred (≤2 px), and nothing overflows — see the "Row width and adaptivity" evidence in the change that introduced it. The selector contract is locked by `ui-conversation`'s `tests/header-seat-styles.client.spec.ts`.

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. The body reads no session store: the owner share handed down by the upstream header entry already carries every fact it renders.

## Runtime invariants

No runtime-invariant companion checks; the package is a UI plugin whose single slot registration is verified for fiber teardown (HMR safety) by its spec suite.

## Model Experience

None, as this package is browser-side header presentation; the stores beneath it (sessions, conversation views) own every fact it renders.

#### KV Cache effect

None; the surface renders logged and list state without assembling or mutating provider requests.

## Known Limitations and Deferred Work

- Views without a registered glyph (ids other than `chat`/`trajectory`) render label-only segments.
- The segmented control appears only when more than one View is registered, mirroring the upstream tabs gate.
