# Agent Note: Root tsdown Client face must read process.env

Status: implemented

English | [中文](2026-08-23-root-tsdown-client-face-env.zh.md)

## Problem

`Release (dsh)` failed during `build:lib:client` with `UNRESOLVED_ENTRY` for `lib/types/index.js` and `lib/types/invariant.js`. Package-local configs already resolved `DSH_BUILD_FACE` from `process.env` when nested workspace configs received an empty inline `env` on Linux CI, but the repository root `tsdown.config.ts` only read `env?.DSH_BUILD_FACE`. Mis-detecting the Client pass as Host re-applied host library entries to every package without a local config.

## Decision

Root `tsdown.config.ts` uses `readBuildFace` from `scripts/tsdown-build-face.ts`, the same resolver package-local configs use. Local development keeps relative `../sdkwork-*` workspace members; CI continues to clone pinned siblings from git via `setup-sdkwork-siblings` and `scripts/sdkwork-sources.manifest.json`.

## Consequences

The Client pass leaves host-only packages without local configs out of entry resolution. A regression test covers `process.env` fallback for `readBuildFace`.

## Testing

`pnpm exec vitest run scripts/tsdown-build-face.spec.ts`
