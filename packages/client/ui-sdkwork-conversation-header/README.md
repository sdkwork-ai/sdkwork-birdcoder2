---
description: "SDKWork conversation header plugin: replaces the conversation session header body with a single-row layout whose View navigation is an icon+label segmented control centered in the header row, and shows the session's project directory name as a chip next to the title breadcrumbs."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-conversation-header

English | [中文](README.zh.md)

## Summary

This plugin redesigns the conversation session header for SDKWork. The upstream header renders a title row (breadcrumbs + actions + utilities) followed by a full-width View tabs strip ("Chat" / "Trajectory") below it — a whole row spent on two labels. This plugin claims the `conversation.session.header.surface` seat declared by `ui-conversation` and replaces the header body with a single row:

1. Left: the breadcrumb cluster (session ancestry), then the project-directory chip (folder glyph + workspace basename from the session cwd, hidden until a cwd exists), plus the action strip.
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
- `src/client/ConversationHeader.tsx` — the surface component. It is a pure function of the owner share handed down by the upstream header entry (child dispatchers, navigation callbacks, breadcrumb chain, View roster, active View id); it renders the breadcrumbs, the project-directory chip (session cwd read through the `useSessions` global standard prop — the same store ConversationRoot reads, so no new contract or wire call), the centered segmented control (`role="tablist"`, lucide glyphs for known View ids), and the action/utility seats.
- `src/client/ConversationHeader.module.css` — the three-zone grid (`1fr auto 1fr`) that keeps the segmented control truly centered at every column width, styled with the shared DSW alias tokens.
- `src/client/locales.ts` — the plugin-owned `sdkworkConversationHeader` namespace (aria labels).

The upstream header entry keeps the `<header>` shell, blank-session hiding, and the View selection store; the plugin owns presentation only and never touches cross-plugin mutable state.

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. The workspace chip reads the session cwd through the `useSessions` global standard prop — the same store ConversationRoot reads — so no new contract or wire call exists for it.

## Runtime invariants

No runtime-invariant companion checks; the package is a UI plugin whose single slot registration is verified for fiber teardown (HMR safety) by its spec suite.

## Model Experience

None, as this package is browser-side header presentation; the stores beneath it (sessions, conversation views) own every fact it renders.

#### KV Cache effect

None; the surface renders logged and list state without assembling or mutating provider requests.

## Known Limitations and Deferred Work

- Views without a registered glyph (ids other than `chat`/`trajectory`) render label-only segments.
- The segmented control appears only when more than one View is registered, mirroring the upstream tabs gate.
