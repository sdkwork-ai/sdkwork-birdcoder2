# @deepseek-ai/dsh-client-ui-generations-image

English | [中文](README.zh.md)

The SDKWork Agents image generation application mode. This browser plugin owns the `image` rail entry and mounts the SDKWork Agents PC **creative (生成)** surface — the same page as the `creative` tab in [sdkwork-agents](https://github.com/sdkwork-ai/sdkwork-agents) — into the keyed `mode.page` seat. It registers keyed `mode.rail.entry` and `mode.page` contributions; clicking the entry selects `image` in the layout store, and the frame renders the embedded [`CreativeView`](../../../../sdkwork-agents/apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-creative/src/CreativeView.tsx) in the center column. The mode was a base placeholder owned by [ui-app-modes](../ui-app-modes/README.md); this plugin takes over its glyphs, copy, and page.

## Embedded surface

The page is not reimplemented in BirdCoder. A host adapter (`creativeHost.ts`) maps [ui-env](../ui-env/README.md) and [ui-iam](../ui-iam/README.md) into the Agents PC session store and SDK client providers, then mounts `@sdkwork/agents-pc-creative`'s `CreativeView` with the Agents workbench i18n catalogs. The embedded input dialog defaults to **image** generation; video and other modalities remain selectable in the same dialog. Video generation uses the sibling [ui-generations-video](../ui-generations-video/README.md) plugin with the same surface and a **video** default.

## Runtime requirements

The active [ui-env](../ui-env/README.md) profile supplies the API gateway origin, application id, and optional static access token. An empty base URL skips SDK client wiring; the embedded page still mounts but generation requests fail until a gateway is configured. A static environment token or an interactive [ui-iam](../ui-iam/README.md) session (both `accessToken` and `authToken`) feeds the Agents PC token manager. Environment and IAM changes invalidate in-flight requests through client remounts and session resynchronization.

## Model Experience

None, as mode selection and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Full creative surface in image mode** — the rail entry is keyed `image`, but the embedded page is the complete Agents creative workbench (all generation modalities), matching sdkwork-agents sidebar **生成** rather than an image-only subset.
- **Online authenticated generation** — there is no offline cache or anonymous fallback when the deployed Agents or Generations APIs require an SDKWork access token with tenant context.
