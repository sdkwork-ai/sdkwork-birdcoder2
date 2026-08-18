# @deepseek-ai/dsh-client-ui-generations-video

English | [中文](README.zh.md)

The SDKWork Agents video generation application mode. This browser plugin owns the `video` rail entry, the localized video generation page, and the SDKWork Agents generation adapter. It registers keyed `mode.rail.entry` and `mode.page` contributions; clicking the entry selects `video` in the layout store, and the frame renders the page in the center column. The mode was a base placeholder owned by [ui-app-modes](../ui-app-modes/README.md); this plugin takes over its glyphs, copy, and page.

## Generation input

The page's input is the **video input**: a prompt composer that describes the video to generate. Submitting the composer invokes the agents media-tool channel through `@sdkwork/agents-app-sdk` with the `video.create` tool id (text-to-video, model `default`, five seconds, 1280×720), then polls `video.retrieve` every 1.5 seconds until the task completes or fails (up to 40 polls). The committed prompt restores the composer draft after a round, and the retry action re-runs the same prompt.

## Runtime requirements

The active [ui-env](../ui-env/README.md) profile supplies the API base URL and optional static access token. An empty base URL renders a configuration notice and creates no SDKWork client. A static environment token takes precedence over the current [ui-iam](../ui-iam/README.md) session; without either credential, the generated SDKWork client rejects protected generation requests before network dispatch and the page offers a retry state.

Image and audio generation stay in the sibling [ui-generations-image](../ui-generations-image/README.md) plugin and the deferred work below. Environment and IAM changes invalidate in-flight requests so an older response cannot replace current generation state.

## Model Experience

None, as mode selection, generation requests, and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Text-to-video only** — the composer sends a single `video.create` request with the default model, five seconds, and a fixed 1280×720 size; image-to-video and video-to-video source inputs, model, duration, and size parameters are not exposed.
- **No persistence** — results are presented from the provider asset URLs returned by the retrieval; `saveToDrive` and the drive asset flow are not used.
- **Online authenticated generation** — there is no offline cache or anonymous fallback when the deployed Agents API requires an SDKWork access token.
