---
description: "SDKWork scaffold capability: bounded packaging reads and confinement-checked project-file writes under a caller-picked directory"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-scaffold-install

English | [中文](README.zh.md)

## Summary

Host capability behind the `sdkworkScaffoldInstall` Remote namespace, serving both directions of the app development scaffold flow. `writeFile` writes one regular file under an operator-picked directory behind a 64 MiB ceiling, creating parents on demand and refusing every path that escapes or that a platform would read as a device. `listFiles` walks one app root under `apps/` for packaging-eligible files with sizes, and `readFiles` returns a bounded batch as base64 so the browser packs a scaffold with its own `.gitignore`-aware packer. The `sdkwork-scaffold-install-controller` Remote projects both faces.

## Table of Contents

- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Understand the implementation

The capability is one policy point for both directions; the wire vocabulary belongs to the controller.

- **Install (write).** `writeFile` writes one regular file under an operator-picked directory, creating parents on demand. Every write re-checks that the resolved path stays inside the target directory and refuses traversal (`..`), absolute and NUL-carrying names, Windows-reserved device segments, and segments ending in a dot or space; the per-file byte ceiling is 64 MiB. The browser side plans a scaffold install (download, unzip, screening in `ui-sdkwork-deploy`'s `scaffoldInstall.ts`) and drives these writes.
- **Publish (read).** `listFiles` walks one app root under the project's `apps/` directory and returns every packaging-eligible regular file with its size. The walk is deterministic (sorted), depth- and count-bounded, never follows symlinks, and prunes dependency stores, build outputs, VCS internals, and agent/runtime state. `readFiles` returns one bounded batch (64 files, 32 MiB, 64 MiB for a single file) of those files as base64. The browser packs the returned bytes with the same `.gitignore`-aware packer it uses for a locally picked directory.

This package owns none of the wire vocabulary; the `sdkwork-scaffold-install-controller` Remote projects both faces.

## Dev Note

The wire vocabulary is owned by the controller Remote; this capability keeps its bounds and path refusals local so the two faces cannot drift.

## Model Experience

None, as the capability only moves caller-supplied bytes between caller-picked paths; it registers no tool, prompt section, or session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The confinement check lexically contains the resolved path under the base's real path; it does not chase pre-existing symlinks inside a write target directory (the operator owns that directory's existing content), and packaging refuses symlinks outright rather than resolving them.
- One file per write call: a large scaffold costs one round trip per file. A chunked-archive write verb (begin/push/finish) is the follow-up if scaffolds routinely carry thousands of large binary files.
- Packaging reads bound the complete result at 20,000 files and 24 directory levels; an app beyond either bound reports `truncated` and the browser refuses to publish a silently incomplete scaffold.
