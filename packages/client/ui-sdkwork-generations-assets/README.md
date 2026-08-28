---
description: "SDKWork Agents assets application mode: the assets rail entry mounting the Agents PC assets surface into the keyed mode.page seat, shadowing the placeholder entries at lower priority."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-generations-assets

English | [中文](README.zh.md)

## Summary


The SDKWork Agents assets application mode. This browser plugin owns the `assets` rail entry and mounts the SDKWork Agents PC **assets (资产)** surface — the same page as the `assets` tab in [sdkwork-agents](https://github.com/sdkwork-ai/sdkwork-agents) — into the keyed `mode.page` seat. It registers keyed `mode.rail.entry` and `mode.page` contributions; clicking the entry selects `assets` in the layout store, and the frame renders the embedded [`AssetsView`](../../../../sdkwork-agents/apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-assets/src/AssetsView.tsx) in the center column. The registrations shadow the placeholder entries of [ui-sdkwork-assets](../ui-sdkwork-assets/README.md) at a lower priority, so the real library renders while the placeholder package stays untouched.

## Table of Contents

- [Asset library](#asset-library)
- [Runtime requirements](#runtime-requirements)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Asset library

The page is not reimplemented in BirdCoder. A host adapter (`assetsHost.ts`) maps [ui-sdkwork-env](../ui-sdkwork-env/README.md) and [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) into the Agents PC session store and Drive SDK client provider, then mounts `@sdkwork/agents-pc-assets`'s `AssetsView` with the Agents workbench i18n catalogs. The embedded surface lists Drive-backed media assets with the same header tabs, filters, grid, and detail modal as the Agents PC workbench.

## Runtime requirements

The active [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile supplies the API gateway origin and optional static access token. [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) session tokens supersede the env bootstrap when the user signs in. The host forwards credentials only; tenant and user identity are resolved inside Agents PC from JWT claims.

## Model Experience

None, as mode selection, Drive listing requests, and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Drive listing only** — the page presents assets returned by the Drive assets API; upload, delete, and move actions follow the Agents PC surface behavior.
- **Online authenticated listing** — there is no offline cache or anonymous fallback when the deployed Drive API requires an SDKWork access token.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The page is not reimplemented here: `assetsHost.ts` only maps ui-sdkwork-env and ui-sdkwork-iam into the Agents PC session store and Drive SDK client provider before mounting `@sdkwork/agents-pc-assets`, so surface fixes belong upstream in sdkwork-agents. This package's registrations shadow ui-sdkwork-assets' placeholder entries at a lower priority — keep the keys identical or both entries render.

</details>
