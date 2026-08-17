# @deepseek-ai/dsh-client-ui-knowledge

English | [中文](README.zh.md)

The Knowledge Base app-mode plugin owns the `knowledge` rail entry, center-column page, and SDKWork host adapter. The rail entry calls the layout store's existing `setMode('knowledge')` action; AppFrame then dispatches the keyed `mode.page` seat, where this package mounts the SDKWork Knowledge Base PC application. Returning to Code restores the conversation surface without URL routing or persisted mode state.

## Runtime requirements

The plugin requires `ctx.env`, `ctx.iam`, and `ctx.locale`. It configures its SDKWork host adapter before registering the page. The active environment supplies the API base URL and optional static access token; a configured static token takes precedence over IAM session credentials. Environment changes rebuild the generated Knowledgebase and Drive clients and remount the SDKWork view, while IAM and locale changes propagate through SDKWork subscriptions without remounting it.

SDKWork navigation runs inside an isolated memory router, so navigation within the Knowledge Base does not modify BirdCoder's browser URL.

## Browser bundle

The client plugin emits one `client.js` closure because the BirdCoder client-module loader does not publish arbitrary sibling chunks. Its bundle face compiles the SDKWork Tailwind stylesheet, injects SDKWork CSS once, provides the PDF.js worker as a Blob URL, and resolves router and i18n context packages to one physical instance. Declaration emit skips strict checking of the sibling SDKWork implementation; `tsconfig.tests.json` checks the consumed source closure with a single React type identity.

## Model Experience

None, as the plugin renders a human-facing browser application and does not add prompt content, tools, or session events.

#### KV Cache effect

None; SDKWork HTTP requests are separate browser traffic and do not alter Harness provider requests.

## Known Limitations and Deferred Work

- **Sibling source requirement** — installing from source or rebuilding the browser closure requires the `../sdkwork-knowledgebase` workspace checkout and its generated Knowledgebase and Drive clients.
- **Single-file payload** — the complete SDKWork application, compiled styles, and PDF worker ship in one client-plugin closure, increasing the initial Knowledge plugin download compared with a chunked application.
