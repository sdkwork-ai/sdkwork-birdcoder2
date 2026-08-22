# Agent Note: SDKWork pins must carry the complete generated SDK tree

Status: implemented

English | [中文](2026-08-23-sdkwork-drive-generated-tree-pin.zh.md)

## Problem

`Release (dsh)` failed in `build:lib:client` with `Could not resolve './assets'` inside the pinned `sdkwork-drive` checkout. The pinned commit tracked the drive SDK's generated `src/api/index.ts` (which re-exports `./assets`) but not `assets.ts` or 110 further generated files: a partial "sync local changes" commit had added some generated files while the rest stayed gitignored. The local checkout worked only because the sibling's own generator had produced the missing files on disk.

## Decision

Repair the sibling repository and move the pin: the missing generated files were committed to `sdkwork-ai/sdkwork-drive` (`chore: commit generated SDK files omitted from the previous sync`), and `scripts/sdkwork-sources.manifest.json` pins `sdkwork-drive` to that commit. Every file was verified against the sha256 hashes in the sibling's committed `sdkwork-generator-manifest.json` before staging, so the committed tree matches the generator's own output record.

A reachability scan (harness `tsconfig.base.json` `@sdkwork/*` path targets walked through tracked sibling files) now reports zero relative imports pointing at untracked files across all workspace siblings.

## Consequences

The release runner clone of every pinned sibling resolves the complete generated SDK sources. Re-pinning a sibling is the remedy whenever a tracked generated index references a file the pinned commit does not carry.

## Testing

Clean-tree rehearsal of the Client tsdown pass with the re-pinned sibling completes. The reachability scan reports zero untracked import targets.
