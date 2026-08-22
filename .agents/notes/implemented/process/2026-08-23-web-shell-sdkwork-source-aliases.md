# Agent Note: Web shell resolves IAM token manager and sdk-common from source

Status: implemented

English | [中文](2026-08-23-web-shell-sdkwork-source-aliases.zh.md)

## Problem

`Release (dsh)` failed in `build:web` with `[commonjs--resolver] Failed to resolve entry for package "@sdkwork/sdk-common"`. The shell's module seed imports `@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager` through its package subpath; the emitted `lib/types` half imports `@sdkwork/sdk-common`, whose package entry points at a `dist` build that only exists in the sibling's own checkout. The release runner clones pinned siblings without `dist`, so Vite cannot resolve the entry.

## Decision

`apps/web/vite-source-aliases.ts` gains two source aliases: the IAM token-manager subpath maps to `packages/client/ui-sdkwork-iam/src/sdkwork-global-token-manager.ts`, and `@sdkwork/sdk-common` maps to the pinned sibling's `src/index.ts`. Both follow the existing pattern (package exports aim at built output for Node consumers; the browser bundle compiles `src`).

## Consequences

The web build no longer depends on sibling `dist` output: the release runner and local checkouts compile the pinned sources identically.

## Testing

`verify-web-vite-aliases` passes; a full `build:official` rehearsal completes and the bundle carries the token manager with no external `@sdkwork/sdk-common` import.
