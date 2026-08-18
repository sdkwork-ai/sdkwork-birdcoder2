# Agent Note: SDKWork Knowledge Base host integration

Status: implemented

English | [中文](2026-08-17-sdkwork-knowledgebase-host-integration.zh.md)

## Problem

The Knowledge Base rail entry needs to open the existing SDKWork Knowledge Base PC application inside BirdCoder. The application expects generated business clients, session and locale ports, React Router context, Tailwind output, and a PDF.js worker, while BirdCoder already owns deployment, authentication, locale, navigation state, and a client loader that evaluates one browser closure per plugin.

## Decision

`@deepseek-ai/dsh-client-ui-knowledge` remains an independent mode plugin in the [app-mode rail](2026-08-16-sidebar-app-modes.md). Its entry calls the layout store's existing `setMode('knowledge')` action, and its keyed `mode.page` registration mounts the SDKWork application in the center column. The mode is transient layout state: Knowledge navigation adds neither a browser route nor a persisted BirdCoder preference.

The `knowledgebaseHost.ts` module inside `@deepseek-ai/dsh-client-ui-knowledge` owns the SDKWork host adaptation. The plugin configures it from the existing `ctx.env`, `ctx.iam`, and `ctx.locale` services before registering the page. The adapter constructs generated Knowledgebase and Drive clients lazily for the active API base URL, gives a configured static environment access token precedence over IAM credentials, maps only usable identity and tenant context fields, and keeps root and context session ids distinct. Environment changes invalidate both clients and remount the SDKWork application; IAM and locale changes propagate through SDKWork subscriptions without a remount.

`KnowledgebaseApp` supplies an isolated `MemoryRouter`, keyed by the environment revision. SDKWork can use its internal navigation APIs, and an environment switch resets that navigation, without reading or changing BirdCoder's browser URL.

## Type and bundle integration

The package's declaration-emission project skips strict checking of the sibling SDKWork implementation, which prevents its private package types from entering published Harness declarations. A separate no-emit TypeScript project compiles the consumed SDKWork source closure with one React type identity, so the adapter cannot drift silently.

The browser build emits one tree-shaken `client.js` closure because the client-module loader neither publishes nor evaluates arbitrary sibling chunks. The bundle face compiles SDKWork's Tailwind stylesheet, injects ordinary SDKWork CSS idempotently, represents the PDF.js worker as a Blob URL, removes browser-inapplicable Node compatibility imports, and resolves router and i18n context packages to one physical instance. React remains a BirdCoder platform module rather than a bundled second runtime.

## Alternatives considered

| Rejected | Reason |
|---|---|
| Add URL routing or persist the Knowledge mode | The layout store already owns mode selection, and SDKWork navigation must not take ownership of BirdCoder's address bar |
| Introduce a Knowledge-specific auth or environment store | `ui-env` and `ui-iam` already own those facts; copying them would create conflicting refresh, sign-out, and deployment state |
| Import SDKWork internals directly from `KnowledgePage` | The page would then own generated-client and session adaptation details instead of using the plugin's dedicated host adapter |
| Emit multiple browser chunks | BirdCoder serves and evaluates only the registered plugin `client.js`; unregistered sibling chunks are not part of the client-module protocol |
| Inject raw Tailwind source at runtime | Browser CSS cannot evaluate Tailwind directives or discover SDKWork utility candidates |
| Share BirdCoder's browser router with SDKWork | SDKWork's internal routes would become application routes and could replace or corrupt the host URL |

## Consequences

Clicking the Knowledge rail icon replaces the Code conversation with the real SDKWork Knowledge Base surface, and returning to Code restores the workbench. SDKWork business HTTP requests remain browser traffic and add no Harness prompt content, tools, session events, or KV Cache input.

The integration requires the `../sdkwork-knowledgebase` sibling checkout and generated clients. Its complete application, compiled styles, and PDF worker reside in one large client-plugin closure. One browser window has one active SDKWork Knowledge Base host adapter because the SDKWork PC runtime ports are process-global.

## Verification

Facade tests pin credential, session, context, locale, environment-revision, and disposal behavior. Plugin tests pin declared injection, keyed registration, teardown, and the SDKWork page marker. The assembled web mode test clicks the Knowledge entry and verifies that the SDKWork page replaces the conversation. The SDKWork source-check project and bundle inspection pin the real source closure, single-file output, and permitted platform imports.
