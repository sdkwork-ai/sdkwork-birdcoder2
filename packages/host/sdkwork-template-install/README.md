---
description: "SDKWork template capability: bounded packaging reads and confinement-checked project-file writes under a caller-picked directory"
---

# @deepseek-ai/dsh-sdkwork-template-install

English | [中文](README.zh.md)

## Summary

Host capability behind the `sdkworkTemplateInstall` Remote namespace. It serves both directions of the app development scaffold template flow:

- **Install (write).** `writeFile` writes one regular file under an operator-picked directory, creating parents on demand. Every write re-checks that the resolved path stays inside the target directory and refuses traversal (`..`), absolute and NUL-carrying names, Windows-reserved device segments, and segments ending in a dot or space; the per-file byte ceiling is 64 MiB. The browser side plans a template install (download, unzip, screening in `ui-sdkwork-deploy`'s `templateInstall.ts`) and drives these writes.
- **Publish (read).** `listFiles` walks one app root under the project's `apps/` directory and returns every packaging-eligible regular file with its size. The walk is deterministic (sorted), depth- and count-bounded, never follows symlinks, and prunes dependency stores, build outputs, VCS internals, and agent/runtime state. `readFiles` returns one bounded batch (64 files, 32 MiB, 64 MiB for a single file) of those files as base64. The browser packs the returned bytes with the same `.gitignore`-aware packer it uses for a locally picked directory.

This package owns none of the wire vocabulary; the `sdkwork-template-install-controller` Remote projects both faces.

## Model Experience

None: the capability moves caller-supplied bytes between caller-picked paths and contributes nothing model-facing — no tools, no context, no Session events.

## Known Limitations and Deferred Work

- The confinement check lexically contains the resolved path under the base's real path; it does not chase pre-existing symlinks inside a write target directory (the operator owns that directory's existing content), and packaging refuses symlinks outright rather than resolving them.
- One file per write call: a large template costs one round trip per file. A chunked-archive write verb (begin/push/finish) is the follow-up if templates routinely carry thousands of large binary files.
- Packaging reads bound the complete result at 20,000 files and 24 directory levels; an app beyond either bound reports `truncated` and the browser refuses to publish a silently incomplete scaffold.
