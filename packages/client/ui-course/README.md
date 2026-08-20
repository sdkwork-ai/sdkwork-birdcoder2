# @deepseek-ai/dsh-client-ui-drive

English | [中文](README.zh.md)

The Drive app-mode plugin owns the `drive` rail entry, center-column page, and SDKWork host adapter. The rail entry calls the layout store's existing `setMode('drive')` action; AppFrame then dispatches the keyed `mode.page` seat, where this package mounts the SDKWork Drive PC application. Returning to Code restores the conversation surface without URL routing or persisted mode state.

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
