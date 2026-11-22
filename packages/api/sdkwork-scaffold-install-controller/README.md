---
description: "SDKWork scaffold Remote: bounded packaging reads and confinement-checked project-file writes over the sdkworkScaffoldInstall namespace"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-sdkwork-scaffold-install-controller

English | [中文](README.zh.md)

## Summary

Host Remote owner of the `sdkworkScaffoldInstall` namespace, serving app development scaffolds in both directions. `writeFile` installs one project file from an absolute target directory, a target-relative path, and base64 content, refusing unclean paths, non-base64 content, and payloads above the 32 MiB wire cap. `listFiles` walks one app root under `apps/` and returns the packaging-eligible files with sizes; `readFiles` returns a bounded batch as base64 so the browser can pack a scaffold without a second filesystem implementation. Capability failures project onto closed `scaffold-install/*` wire codes.

## Table of Contents

- [Understand the implementation](#understand-the-implementation)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Understand the implementation

Three verbs carry the flow, and each one is refused at the wire boundary before the capability runs:

- `writeFile` installs one project file: an absolute target directory, a target-relative path, and base64 content. The wire layer refuses unclean paths (separators in segments, `..`, reserved Windows device names, dot/space-terminated segments), non-base64 content, and payloads above the 32 MiB wire cap; the `sdkwork-scaffold-install` capability behind it re-checks confinement and writes with parent creation.
- `listFiles` walks one app root under the project's `apps/` directory and returns the packaging-eligible files with sizes (bounded, symlink-free walk).
- `readFiles` returns one bounded batch of those files as base64 (at most 64 paths), so the browser can pack a scaffold with its `.gitignore`-aware packer without a second file-system implementation.

Source-directory failures project onto `scaffold-install/source-unreadable`, path refusals onto `scaffold-install/path-unsafe`, caps onto `scaffold-install/content-too-large`, and read failures onto `scaffold-install/read-failed`. The browser's scaffold planner and installer live in `ui-sdkwork-deploy`.

## Dev Note

The `scaffold-install/*` wire codes are closed: adding a verb requires updating this Remote, its generated SDK contract, and the browser packer together.

## Model Experience

None, as the Remote only moves caller-supplied bytes between caller-picked paths; it registers no tool, prompt section, or session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- One file per write call; a chunked-archive write verb (begin/push/finish) is the follow-up if scaffolds routinely carry thousands of large binary files.
- Packaging reads are bounded at 64 paths per batch and 32 MiB per batch; the gate is on the wire, so a larger request is refused before the capability reads anything.
