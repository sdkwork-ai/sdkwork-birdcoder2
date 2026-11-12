---
description: "SDKWork template Remote: bounded packaging reads and confinement-checked project-file writes over the sdkworkTemplateInstall namespace"
---

# @deepseek-ai/dsh-api-sdkwork-template-install-controller

English | [中文](README.zh.md)

## Summary

Host Remote owner of the `sdkworkTemplateInstall` namespace. Three verbs serve app development scaffold templates:

- `writeFile` installs one project file: an absolute target directory, a target-relative path, and base64 content. The wire layer refuses unclean paths (separators in segments, `..`, reserved Windows device names, dot/space-terminated segments), non-base64 content, and payloads above the 32 MiB wire cap; the `sdkwork-template-install` capability behind it re-checks confinement and writes with parent creation.
- `listFiles` walks one app root under the project's `apps/` directory and returns the packaging-eligible files with sizes (bounded, symlink-free walk).
- `readFiles` returns one bounded batch of those files as base64 (at most 64 paths), so the browser can pack a scaffold with its `.gitignore`-aware packer without a second file-system implementation.

Source-directory failures project onto `template-install/source-unreadable`, path refusals onto `template-install/path-unsafe`, caps onto `template-install/content-too-large`, and read failures onto `template-install/read-failed`. The browser's template planner and installer live in `ui-sdkwork-deploy`.

## Model Experience

None: the Remote moves caller-supplied bytes between caller-picked paths and contributes nothing model-facing — no tools, no context, no Session events.

## Known Limitations and Deferred Work

- One file per write call; a chunked-archive write verb (begin/push/finish) is the follow-up if templates routinely carry thousands of large binary files.
- Packaging reads are bounded at 64 paths per batch and 32 MiB per batch; the gate is on the wire, so a larger request is refused before the capability reads anything.
