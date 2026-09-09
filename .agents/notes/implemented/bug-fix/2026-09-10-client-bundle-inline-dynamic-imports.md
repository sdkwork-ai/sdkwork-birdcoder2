# Agent Note: Client bundles inline dynamic imports into the single artifact

Status: implemented

English | [中文](2026-09-10-client-bundle-inline-dynamic-imports.zh.md)

## Problem

A client bundle is one closure-factory artifact: the boot graph serves exactly one script per plugin row, and the module table's require answers only package-name specifiers (seed words, graph rows, registered factories). Rolldown still code-split dynamic `import()` calls into sibling chunks, so the explorer's Monaco bootstrap (`monacoSetup.ts`, shipped with the applied-change diff tab) emitted `editor.api-<hash>.cjs` next to `lib/client.js` and lowered the import to `require("./editor.api-<hash>.cjs")`. At materialization the loader require missed the module table — the chunks are relative paths no graph row owns, and they are absent from the package's `files` allowlist — so every Monaco tab died with "missed the module table". No gate caught it: the bundle purity gate checks module edges, not emitted file counts.

## Decision

The shared client preset (`packages/client/tsdown.client.ts`) sets `outputOptions.codeSplitting: false` on every plugin client bundle, inlining dynamic-import modules into `lib/client.js`; rolldown lowers `import()` to an internal lazy initialization with no require call. A spec in `scripts/client-bundle-purity.spec.ts` pins the single-artifact output options. The apikey embed keeps its deliberate externalization of bare `monaco-editor`: an external dynamic import stays a require the table rejects, and the sibling editor's degraded read-only fallback catches it, unchanged.

## Alternatives considered

**Serve and register the chunks per plugin row.** Rejected: the module table is flat and keyed by package name, so teaching it relative chunk paths means a per-plugin subgraph, a second serving path, and HMR invalidation for artifacts the `files` allowlist does not publish — all to preserve one lazy download.

**Externalize Monaco the way apikey does, degrading to the fallback viewer.** Rejected: the explorer's file and diff tabs are the surface the kernel exists for; the degraded plain view is an embed's compromise, not the explorer's.

**Ban dynamic imports from client sources.** Rejected: the lazy-singleton pattern is legitimate source structure; the contract forbids split artifacts, not the syntax.

## Consequences

Every plugin client bundle materializes with no relative requires, and a plugin bundle that adds a dynamic import stays loadable instead of gaining a runtime throw. Monaco ships inside the explorer's `lib/client.js`, so the explorer row downloads the kernel with the bundle instead of on first editor tab — the same eager shape every other bundled dependency already has, with laziness remaining at materialization. `codeSplitting: false` is a no-op for bundles without dynamic imports; no other client package emitted sibling chunks. The stale chunk residue under `ui-sdkwork-explorer/lib/` is deleted. Coverage: the preset spec pins `entryFileNames: 'client.js'` with `codeSplitting: false`; the trajectory artifact spec materializes a rebuilt bundle; the rebuilt explorer bundle contains no `require("./…")` call. Related: [the explorer's applied-change diff tab](../feature/2026-09-09-sdkwork-explorer-applied-change-diff-tab.md), whose Monaco bootstrap surfaced the gap.
