# @deepseek-ai/dsh-client-ui-sdkwork-generations-video

English | [中文](README.zh.md)

The SDKWork Agents video generation application mode. This browser plugin owns the `video` rail entry and mounts the SDKWork Agents PC **creative (生成)** surface — the same page as the `creative` tab in [sdkwork-agents](https://github.com/sdkwork-ai/sdkwork-agents) — into the keyed `mode.page` seat. It registers keyed `mode.rail.entry` and `mode.page` contributions; clicking the entry selects `video` in the layout store, and the frame renders the embedded [`CreativeView`](../../../../sdkwork-agents/apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-creative/src/CreativeView.tsx) in the center column. The mode was a base placeholder owned by [ui-sdkwork-app-modes](../ui-sdkwork-app-modes/README.md); this plugin takes over its glyphs, copy, and page.

## Embedded surface

The page is not reimplemented in BirdCoder. A host adapter (`creativeHost.ts`) maps [ui-sdkwork-env](../ui-sdkwork-env/README.md) and [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) into the Agents PC session store and SDK client providers, then mounts `@sdkwork/agents-pc-creative`'s `CreativeView` with the Agents workbench i18n catalogs. The embedded input dialog defaults to **video** generation; image and other modalities remain selectable in the same dialog. Image generation uses the sibling [ui-sdkwork-generations-image](../ui-sdkwork-generations-image/README.md) plugin with the same surface and an **image** default.

## Runtime requirements

The active [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile supplies the API gateway origin, application id, and optional static access token. An empty base URL skips SDK client wiring; the embedded page still mounts but generation requests fail until a gateway is configured. A static environment token or an interactive [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) session (both `accessToken` and `authToken`) feeds the Agents PC token manager. Environment and IAM changes invalidate in-flight requests through client remounts and session resynchronization.

## Model Experience

None, as mode selection and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Full creative surface in video mode** — the rail entry is keyed `video`, but the embedded page is the complete Agents creative workbench (all generation modalities), matching sdkwork-agents sidebar **生成** rather than a video-only subset.
- **Online authenticated generation** — there is no offline cache or anonymous fallback when the deployed Agents or Generations APIs require an SDKWork access token with tenant context.
