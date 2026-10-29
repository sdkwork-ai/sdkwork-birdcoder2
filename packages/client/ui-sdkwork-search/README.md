---
description: "Search app mode as an independent module: the mode-rail entry above the customize button and the SDKWork Search-backed page, with the BirdCoder capability catalog and the SDKWork index query runtime."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-search

English | [中文](README.zh.md)

## Summary

The Search app mode as an independent module: its mode-rail entry and its center-column page. The rail shell (ui-sdkwork-app-modes) renders one keyed `mode.rail.entry` seat per mode id and hands each entry the live selection facts; this package registers the `search` entry — glyph, copy, and chrome — and the `search` page into the frame's keyed `mode.page` slot. The mode id joins the frame's `AppModeId` vocabulary in ui-layout and the rail's user-owned entry set: it starts hidden like every other optional mode, the customize dialog enables it, and once enabled it sits below Assets and directly above the customize plus button.

The page queries through the SDKWork Search capability seam: `@sdkwork/search-service` owns query ranking, grouping, and paging; `@sdkwork/search-contracts` carries the document and result vocabulary; and the generated `@sdkwork/search-app-sdk` client reaches the Search application index. Two document sets feed the same pipeline — the plugin's own capability catalog (the product surfaces whose keyed `mode.page` entry is registered, resolved from this package's locale dictionaries) and, when the deployment carries credentials, the SDKWork Search index. A local hit switches the frame to the mode its document names; an indexed hit navigates only when its `metadata.mode` names a surface this client can render.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Search pipeline](#search-pipeline)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The plugin requires `ctx.slots`, `ctx.locale`, `ctx.env`, `ctx.iam`, and `ctx.layout`. The environment supplies the API gateway origin and optional static access token; the IAM session supplies the signed-in credentials the generated client forwards through the shared SDKWork token manager (ui-sdkwork-iam's `sdkwork-global-token-manager`, a platform module). The runtime rebuilds its generated client when the gateway origin changes and drops it on plugin teardown.

The local catalog needs no gateway: the page answers signed out and offline. The SDKWork index query runs only when an IAM session exists or the environment carries a static access token, and a failed index query degrades the page to local results with a visible notice instead of failing the whole search.

## Search pipeline

1. The page submits the trimmed query through the injected runtime face.
2. The runtime builds the catalog for the active dictionaries and live `mode.page` keys, then runs the SDKWork service facade over those documents.
3. When credentials exist, the same facade queries the SDKWork index through the generated app client; the response arrives untyped on the wire, so the runtime normalizes it at that boundary and drops malformed rows.
4. Local sections render first, then indexed sections; a hit without a navigable destination renders as text only.

## Model Experience

None, as the package is a human-facing browser surface; it adds no prompt content, tools, or session events.

#### KV Cache effect

None; SDKWork Search requests are separate browser traffic and do not alter Harness provider requests.

## Known Limitations and Deferred Work

- **Sibling source requirement** — rebuilding the client closure requires the `../sdkwork-search` workspace checkout for the search contracts, service, and generated app SDK.
- **Local catalog scope** — the page indexes the app's navigable surfaces only; session-content search stays in the sidebar's own search control, and remote hits without a catalog mode are informational.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The rail position is the `search` row in ui-sdkwork-app-modes' `RAIL_MODE_ORDER` together with its absence from `FIXED_MODES`, which is what makes it ship hidden and be enabled from the customize dialog; once enabled it ends the top group, immediately above the customize plus button. The app-header title dictionary needs the matching `mode.search` row — adding a mode id fails that package's typecheck until both the roster and the dictionary carry it. The catalog duplicates the mode titles in its own `search` namespace because cross-plugin value imports are forbidden; a mode rename must reach both dictionaries.

</details>

## Runtime invariants

The runtime owns one generated client per gateway origin; a stale client is never reused across environments. Search state is component-local: the page keeps its query text, in-flight status, and last outcome, so switching modes discards it rather than persisting a search across sections.
