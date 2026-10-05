---
description: "SDKWork template install capability: bounded, confinement-checked project-file writes under a caller-picked directory for use-template scaffolding"
---

# @deepseek-ai/dsh-sdkwork-template-install

English | [中文](README.zh.md)

## Summary

Host capability behind the `sdkworkTemplateInstall` Remote namespace: write one regular file under an operator-picked directory, with parent creation on demand. Every write re-checks that the resolved path stays inside the target directory and refuses traversal (`..`), absolute and NUL-carrying names, Windows-reserved device segments, and segments ending in a dot or space; the per-file byte ceiling is 64 MiB. The browser side plans a template install (download, unzip, screening in `ui-sdkwork-deploy`'s `templateInstall.ts`) and drives these writes; this package owns none of the wire vocabulary.

## Model Experience

None: the capability moves caller-supplied bytes to caller-picked paths and contributes nothing model-facing — no tools, no context, no Session events.

## Known Limitations and Deferred Work

- The confinement check lexically contains the resolved path under the target's real path; it does not chase pre-existing symlinks inside the target directory (the operator owns that directory's existing content).
- One file per call: a large template costs one round trip per file. A chunked-archive verb (begin/push/finish) is the follow-up if templates routinely carry thousands of files.
