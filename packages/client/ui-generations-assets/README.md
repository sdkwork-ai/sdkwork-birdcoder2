# @deepseek-ai/dsh-client-ui-generations-assets

English | [中文](README.zh.md)

The SDKWork Agents assets application mode. This browser plugin owns the `assets` rail entry and mounts the SDKWork Agents PC **assets (资产)** surface — the same page as the `assets` tab in [sdkwork-agents](https://github.com/sdkwork-ai/sdkwork-agents) — into the keyed `mode.page` seat. It registers keyed `mode.rail.entry` and `mode.page` contributions; clicking the entry selects `assets` in the layout store, and the frame renders the embedded [`AssetsView`](../../../../sdkwork-agents/apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-assets/src/AssetsView.tsx) in the center column. The registrations shadow the placeholder entries of [ui-assets](../ui-assets/README.md) at a lower priority, so the real library renders while the placeholder package stays untouched.

## Asset library

The page is not reimplemented in BirdCoder. A host adapter (`assetsHost.ts`) maps [ui-env](../ui-env/README.md) and [ui-iam](../ui-iam/README.md) into the Agents PC session store and Drive SDK client provider, then mounts `@sdkwork/agents-pc-assets`'s `AssetsView` with the Agents workbench i18n catalogs. The embedded surface lists Drive-backed media assets with the same header tabs, filters, grid, and detail modal as the Agents PC workbench.

## Runtime requirements

The active [ui-env](../ui-env/README.md) profile supplies the API gateway origin and optional static access token. [ui-iam](../ui-iam/README.md) session tokens supersede the env bootstrap when the user signs in. The host forwards credentials only; tenant and user identity are resolved inside Agents PC from JWT claims.

## Model Experience

None, as mode selection, Drive listing requests, and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Drive listing only** — the page presents assets returned by the Drive assets API; upload, delete, and move actions follow the Agents PC surface behavior.
- **Online authenticated listing** — there is no offline cache or anonymous fallback when the deployed Drive API requires an SDKWork access token.
