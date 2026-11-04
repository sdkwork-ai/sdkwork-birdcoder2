---
description: "SDKWork Agents video generation application mode: the video rail entry mounting the Agents PC creative surface into the keyed mode.page seat with a video default."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-generations-video

English | [中文](README.zh.md)

## Summary


The SDKWork Agents video generation application mode. This browser plugin owns the `video` rail entry and mounts the SDKWork Agents PC **creative (生成)** surface — the same page as the `creative` tab in [sdkwork-agents](https://github.com/sdkwork-ai/sdkwork-agents) — into the keyed `mode.page` seat. It registers keyed `mode.rail.entry` and `mode.page` contributions; clicking the entry selects `video` in the layout store, and the frame renders the embedded [`CreativeView`](../../../../sdkwork-agents/apps/sdkwork-agents-pc/packages/sdkwork-agents-pc-creative/src/CreativeView.tsx) in the center column. The mode was a base placeholder owned by [ui-sdkwork-app-modes](../ui-sdkwork-app-modes/README.md); this plugin takes over its glyphs, copy, and page.

## Table of Contents

- [Embedded surface](#embedded-surface)
- [Runtime requirements](#runtime-requirements)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Embedded surface

The page is not reimplemented in BirdCoder. A host adapter (`creativeHost.ts`) maps [ui-sdkwork-env](../ui-sdkwork-env/README.md) and [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) into the Agents PC session store and SDK client providers, then mounts `@sdkwork/agents-pc-creative`'s `CreativeView` with the Agents workbench i18n catalogs. The embedded input dialog defaults to **video** generation; image and other modalities remain selectable in the same dialog. Image generation uses the sibling [ui-sdkwork-generations-image](../ui-sdkwork-generations-image/README.md) plugin with the same surface and an **image** default.

## Runtime requirements

The active [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile supplies the API gateway origin, application id, and optional static access token. An empty base URL skips SDK client wiring; the embedded page still mounts but generation requests fail until a gateway is configured. A static environment token or an interactive [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) session (both `accessToken` and `authToken`) feeds the Agents PC token manager. An environment switch or a different signed-in account remounts the embedded surface: the creative session list is account-scoped server state, so it reloads for the new account instead of keeping the previous account's sessions on screen. A token refresh of the same account only resynchronizes the credential transport, and the page keeps its state.

The page **states** its sign-in requirement up front. Generation needs a session for the work it creates, so the embedded creative surface mounts only after [ui-sdkwork-iam](../ui-sdkwork-iam/README.md) reports a signed-in session; signed out, the page renders its own notice (heading, supporting copy, and a Sign in button) in place of the surface, and only that button opens the sign-in overlay. The host adapter keeps the requirement's transport half — `createSignInRequestInterceptor` still holds a user-initiated request that a session ending mid-page would otherwise send anonymously — but no generation call is attempted while signed out.

## Model Experience

None, as mode selection and SDKWork HTTP responses remain browser viewing state and add no model request content, tools, or session events.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Full creative surface in video mode** — the rail entry is keyed `video`, but the embedded page is the complete Agents creative workbench (all generation modalities), matching sdkwork-agents sidebar **生成** rather than a video-only subset.
- **Account switch clears the server list, not the embedded browser cache** — the remount reloads the incoming account's sessions, but the embedded creative package stores its prompt history under one browser-global key that is not namespaced by account; that copy stays until sdkwork-agents scopes it.
- **Online authenticated generation** — there is no offline cache or anonymous fallback when the deployed Agents or Generations APIs require an SDKWork access token with tenant context. Signed out, the mode states the requirement instead of attempting the call; a session that ends while the page stays mounted holds the next user-initiated request at the transport gate.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The rail key is `video`, but the embedded page is the complete Agents creative workbench shared with ui-sdkwork-generations-image — the two plugins differ only in the dialog's default modality, so keep `creativeHost.ts` and the sibling image plugin's adapter in step when the Agents PC surface moves. An empty base URL still mounts the page but generation fails until a gateway is configured. The sign-in requirement is stated by the page (`AuthenticatedSdkworkModePage`, whose shell replaces the surface with the notice) and enforced on the wire by `createSignInRequestInterceptor` for a session that ends while the page stays mounted; keep both when the Agents PC surface moves.

</details>

## Runtime invariants

No runtime invariant companion is published; the mode state lives in the layout store declared action set, and the entry/page registrations follow the rail shell keyed dispatch; store/mode agreement is covered directly by this package client behavior specs.
