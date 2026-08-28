---
description: "Drive app-mode plugin: the drive rail entry, center-column page, and SDKWork host adapter that mounts the SDKWork Drive PC application with CDN-loaded Monaco preview."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-drive

English | [中文](README.zh.md)

## Summary


The Drive app-mode plugin owns the `drive` rail entry, center-column page, and SDKWork host adapter. The rail entry calls the layout store's existing `setMode('drive')` action; AppFrame then dispatches the keyed `mode.page` seat, where this package mounts the SDKWork Drive PC application. Returning to Code restores the conversation surface without URL routing or persisted mode state.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Browser bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The plugin requires `ctx.env`, `ctx.iam`, and `ctx.locale`. It configures its SDKWork host adapter before registering the page. The active environment supplies the API base URL and optional static access token; a configured static token takes precedence over IAM session credentials. Environment changes rebuild the generated Drive client and remount the SDKWork view, while IAM and locale changes propagate through SDKWork subscriptions without remounting it.

## Browser bundle

The client plugin emits one `client.js` closure because the BirdCoder client-module loader does not publish arbitrary sibling chunks. Its bundle face compiles the SDKWork Tailwind stylesheet and injects SDKWork CSS once. The embedded Drive page loads the Monaco editor from its CDN only when a text file preview opens, so the closure stays lean. Declaration emit skips strict checking of the sibling SDKWork implementation; `tsconfig.tests.json` checks the consumed source closure with a single React type identity.

## Model Experience

None, as the plugin renders a human-facing browser application and does not add prompt content, tools, or session events.

#### KV Cache effect

None; SDKWork HTTP requests are separate browser traffic and do not alter Harness provider requests.

## Known Limitations and Deferred Work

- **Sibling source requirement** — installing from source or rebuilding the browser closure requires the `../sdkwork-drive` workspace checkout and its generated Drive client.
- **Single-file payload** — the complete SDKWork application and compiled styles ship in one client-plugin closure, increasing the initial Drive plugin download compared with a chunked application.
- **One active host adapter** — the SDKWork Drive PC runtime ports are process-global, so one browser window hosts one Drive surface; reconfiguration disposes the previous adapter.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The SDKWork Drive PC runtime ports are process-global: one browser window hosts one Drive surface, and reconfiguration disposes the previous adapter. Local installs need the `../sdkwork-drive` sibling checkout, and the single `client.js` closure exists because the BirdCoder client-module loader does not publish sibling chunks — Monaco stays out of it by loading from its CDN only when a text-file preview opens.

</details>
