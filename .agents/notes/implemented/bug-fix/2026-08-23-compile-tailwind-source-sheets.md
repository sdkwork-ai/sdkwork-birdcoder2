# Agent Note: Compile Tailwind v4 source sheets in SDKWork client bundles

Status: implemented

English | [中文](2026-08-23-compile-tailwind-source-sheets.zh.md)

## Problem

The desktop renderer serves every UI plugin's `lib/client.js` bundle over `app://dsh/`; the web carrier serves the same bundles over HTTP. SDKWork client bundles inline component CSS as injected `<style data-plugin-css>` tags. The `ui-sdkwork-appstore` plain-CSS inliner emitted `sdkwork-appstore-pc-host/src/styles.css` verbatim. That file is a Tailwind v4 source sheet: it opens with `@import "tailwindcss";` and `@plugin "tailwindcss-animate";`, then declares `@theme` values and custom rules. A browser resolves the bare `@import "tailwindcss"` inside the injected style tag against the document origin and fetches `app://dsh/tailwindcss` (or `/tailwindcss` over HTTP), which no carrier route table serves — the renderer logs `net::ERR_ABORTED 404` on every boot and the sheet's own rules never apply. This is the same failure class as the packaged `app://dsh/tailwindcss/theme.css` 404, but through the package-local plain-CSS inliner rather than the preset global-inline plugin ([tailwind-css-entry-vs-global-inline-and-inspector-pack](../../implemented/process/2026-08-23-tailwind-css-entry-vs-global-inline-and-inspector-pack.md)).

## Decision

`packages/client/ui-sdkwork-appstore/tsdown.config.ts` now detects Tailwind source sheets (a file opening with `@import "tailwindcss"` or `@plugin`) and compiles them through the same `@tailwindcss/node` pipeline as the app `index.css`: `compile` with the package-install resolvers, `Scanner` over the SDKWork source roots, `optimize`. Plain CSS without Tailwind directives keeps the previous verbatim inline path. This mirrors the sdkwork-appstore Vite app, where `@tailwindcss/vite` compiles every imported Tailwind sheet; the desktop bundle now carries the same compiled output. The compiled sheet registers its scanner files and globs as watch dependencies, so `--watch` rebuilds stay current.

The bundle test pins the regression: `lib/client.js` must not contain `@import \"tailwindcss` or `@plugin \"tailwindcss` as raw text.

## Alternatives considered

**Strip Tailwind directives in `readPlainCss`.** Rejected because a sheet's `@theme` and utility layers would silently stop being generated once they diverge from the compiled `index.css`; the bundle would lose styling without failing.

**Drop the duplicate sheet because `index.css` currently is a superset of it.** Rejected because that couples the bundle to the two files never diverging; a future rule added to `styles.css` alone would silently vanish.

## Consequences

The appstore bundle now carries the compiled `styles.css` output (about 118 KB minified) in addition to the compiled `index.css`; the utility duplication matches what the source Vite app concatenates. Raw Tailwind directives no longer reach the renderer, so the boot-time 404 is gone. The other SDKWork client packages (`ui-sdkwork-course`, `ui-sdkwork-drive`, `ui-sdkwork-iam`, `ui-sdkwork-knowledge`, `ui-sdkwork-token-plan`, `ui-sdkwork-generations-*`) share the same copy-pasted plain-CSS inliner; none of their current checkouts imports a Tailwind source sheet directly, so the same latent failure is possible there until the pattern is fixed or extracted into `tsdown.client.ts`.
