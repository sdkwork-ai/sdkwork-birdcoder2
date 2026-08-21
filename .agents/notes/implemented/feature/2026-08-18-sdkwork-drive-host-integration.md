# Agent Note: SDKWork Drive host integration

Status: implemented

English | [中文](2026-08-18-sdkwork-drive-host-integration.zh.md)

## Problem

The Drive rail entry needs to open the existing SDKWork Drive PC application inside BirdCoder. The application expects generated Drive clients, session and locale ports, Tailwind output, and a lazy Monaco preview, while BirdCoder already owns deployment, authentication, locale, navigation state, and a client loader that evaluates one browser closure per plugin.

## Decision

`@deepseek-ai/dsh-client-ui-sdkwork-drive` is an independent mode plugin in the [app-mode rail](2026-08-16-sidebar-app-modes.md). Its entry calls the layout store's existing `setMode('drive')` action, and its keyed `mode.page` registration mounts the SDKWork application in the center column. The mode is transient layout state: Drive navigation adds neither a browser route nor a persisted BirdCoder preference.

The `driveHost.ts` module inside `@deepseek-ai/dsh-client-ui-sdkwork-drive` owns the SDKWork host adaptation. The plugin configures it from the existing `ctx.env`, `ctx.iam`, and `ctx.locale` services before registering the page. The adapter constructs the generated Drive client lazily for the active API base URL, gives a configured static environment access token precedence over IAM credentials, maps only usable identity and tenant context fields, and keeps root and context session ids distinct. Environment changes invalidate the client and remount the SDKWork application; IAM and locale changes propagate through SDKWork subscriptions without a remount.

`DriveApp` keys the SDKWork `DriveView` by the environment revision, so an environment switch rebuilds the surface's runtime. Unlike the Knowledge Base surface, Drive does not use a router: `sdkwork-drive-pc-drive`'s `DriveView` is self-contained and reads the host ports (`getDriveClient`, `readHostSession`, `subscribeHostSession`, `resolveHostLanguage`, `subscribeHostLanguage`) through `configureDrivePcRuntime`.

## Type and bundle integration

The package's declaration-emission project skips strict checking of the sibling SDKWork implementation, which prevents its private package types from entering published Harness declarations. A separate no-emit TypeScript project compiles the consumed SDKWork source closure with one React type identity, so the adapter cannot drift silently.

The browser build emits one tree-shaken `client.js` closure because the client-module loader neither publishes nor evaluates arbitrary sibling chunks. The bundle face compiles SDKWork's Tailwind stylesheet, resolves plain CSS `@import` chains and strips Tailwind compile-time directives before injecting the styles idempotently, and removes browser-inapplicable Node compatibility imports. The Monaco text preview stays a lazy module whose editor loads from its CDN at first use, so the closure does not carry the editor binary. React remains a BirdCoder platform module rather than a bundled second runtime.

## Alternatives considered

| Rejected | Reason |
|---|---|
| Add URL routing or persist the Drive mode | The layout store already owns mode selection, and SDKWork navigation must not take ownership of BirdCoder's address bar |
| Introduce a Drive-specific auth or environment store | `ui-sdkwork-env` and `ui-sdkwork-iam` already own those facts; copying them would create conflicting refresh, sign-out, and deployment state |
| Import SDKWork internals directly from `DrivePage` | The page would then own generated-client and session adaptation details instead of using the plugin's dedicated host adapter |
| Emit multiple browser chunks | BirdCoder serves and evaluates only the registered plugin `client.js`; unregistered sibling chunks are not part of the client-module protocol |
| Inject raw Tailwind source at runtime | Browser CSS cannot evaluate Tailwind directives or discover SDKWork utility candidates |
| Bundle the Monaco editor | `@monaco-editor/react` loads the editor from its CDN by default; inlining it would add megabytes to the plugin closure for a preview opened on demand |

## Consequences

Clicking the Drive rail icon replaces the Code conversation with the real SDKWork Drive surface, and returning to Code restores the workbench. SDKWork business HTTP requests remain browser traffic and add no Harness prompt content, tools, session events, or KV Cache input.

The integration requires the `../sdkwork-drive` sibling checkout and generated clients. Its complete application and compiled styles reside in one large client-plugin closure. One browser window has one active SDKWork Drive host adapter because the SDKWork PC runtime ports are process-global; the Knowledge Base and Drive adapters configure independent port registries, so both surfaces can coexist.

## Verification

Facade tests pin credential, session, context, locale, environment-revision, and disposal behavior; an integration spec configures the real host adapter and mounts the SDKWork surface in jsdom, pinning client construction, port handoff, the environment-driven remount, and the fail-loud paths. Plugin tests pin declared injection, keyed registration, teardown, and the SDKWork page marker. The assembled web mode test clicks the Knowledge and Drive entries and verifies that each SDKWork page replaces the conversation and that Drive sits directly below Knowledge in the rail. The SDKWork source-check project and bundle inspection pin the real source closure, single-file output, compiled Tailwind styles, and permitted platform imports.
