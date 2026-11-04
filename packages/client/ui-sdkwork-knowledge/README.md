---
description: "Knowledge Base app-mode plugin: the knowledge rail entry, center-column page, and SDKWork host adapter that mounts the SDKWork Knowledge Base PC application."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-knowledge

English | [中文](README.zh.md)

## Summary


The Knowledge Base app-mode plugin owns the `knowledge` rail entry, center-column page, the SDKWork host adapter, and the `ctx.knowledgeBases` catalog other browser surfaces read. The rail entry calls the layout store's existing `setMode('knowledge')` action; AppFrame then dispatches the keyed `mode.page` seat, where this package mounts the SDKWork Knowledge Base PC application. Returning to Code restores the conversation surface without URL routing or persisted mode state.

## Table of Contents

- [Runtime requirements](#runtime-requirements)
- [Knowledge Base catalog](#knowledge-base-catalog)
- [Browser bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Runtime requirements

The plugin requires `ctx.env`, `ctx.iam`, and `ctx.locale`. It configures its SDKWork host adapter before registering the page. The active environment supplies the API base URL and optional static access token; a configured static token takes precedence over IAM session credentials. Environment changes rebuild the generated Knowledgebase and Drive clients and remount the SDKWork view, while IAM and locale changes propagate through SDKWork subscriptions without remounting it.

SDKWork navigation runs inside an isolated memory router, so navigation within the Knowledge Base does not modify BirdCoder's browser URL.

## Knowledge Base catalog

Applying the plugin provides `ctx.knowledgeBases`, the Knowledge Base capability browser surfaces reuse instead of speaking to SDKWork directly. `list` resolves the application's own selection projection (`knowledgeSelectionService.getBases`) and returns the knowledge bases the signed-in user can attach, ordered as the application lists them and labelled with their team or personal group. `retrieve(query, spaceIds, signal)` calls the generated app client's `knowledge.retrievals.create` and returns the leading passages, dropping blank titles and contents and stopping at five.

The service reads the environment and IAM state on every call, so a re-authenticated or switched environment reaches the next request without re-mounting anything. Listing and retrieval both honour the caller's abort signal.

## Browser bundle

The client plugin emits one `client.js` closure because the BirdCoder client-module loader does not publish arbitrary sibling chunks. Its bundle face compiles the SDKWork Tailwind stylesheet, injects SDKWork CSS once, provides the PDF.js worker as a Blob URL, and resolves router and i18n context packages to one physical instance. Declaration emit skips strict checking of the sibling SDKWork implementation; `tsconfig.tests.json` checks the consumed source closure with a single React type identity.

## Model Experience

None, as the plugin renders a human-facing browser application and its catalog only returns knowledge bases and passages to browser callers, whose own draft text is what a user may send.

#### KV Cache effect

None; SDKWork HTTP requests are separate browser traffic and do not alter Harness provider requests.

## Known Limitations and Deferred Work

- **Sibling source requirement** — installing from source or rebuilding the browser closure requires the `../sdkwork-knowledgebase` workspace checkout and its generated Knowledgebase and Drive clients.
- **Single-file payload** — the complete SDKWork application, compiled styles, and PDF worker ship in one client-plugin closure, increasing the initial Knowledge plugin download compared with a chunked application.
- **Selection projection is application-owned** — the catalog lists what the Knowledge Base application offers to the signed-in user (`knowledgeSelectionService.getBases`); it does not expose a space directory of its own, so a deployment without that application projection yields an empty catalog.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The bundle face provides the PDF.js worker as a Blob URL and resolves router and i18n context packages to one physical instance — duplicating those packages reintroduces subtle mount bugs. Local installs need the `../sdkwork-knowledgebase` sibling checkout, and the single `client.js` closure exists because the BirdCoder client-module loader does not publish sibling chunks.

</details>

## Runtime invariants

No runtime invariant companion is published; the mode state lives in the layout store declared action set, and the entry/page registrations follow the rail shell keyed dispatch; store/mode agreement is covered directly by this package client behavior specs.
