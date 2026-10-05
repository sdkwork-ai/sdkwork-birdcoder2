---
description: "SDKWork template install Remote: confinement-checked, bounded project-file writes under a caller-picked directory"
---

# @deepseek-ai/dsh-api-sdkwork-template-install-controller

English | [中文](README.zh.md)

## Summary

Host Remote owner of the `sdkworkTemplateInstall` namespace: one verb, `writeFile`, carrying an absolute target directory, a target-relative path, and base64 content. The wire layer refuses unclean paths (separators in segments, `..`, reserved Windows device names, dot/space-terminated segments), non-base64 content, and payloads above the 32 MiB wire cap; the `sdkwork-template-install` capability behind it re-checks confinement and writes with parent creation. The browser's template-install planner (`ui-sdkwork-deploy`'s `templateInstall.ts`) drives these writes.

## Model Experience

None: the Remote moves caller-supplied bytes to caller-picked paths and contributes nothing model-facing — no tools, no context, no Session events.

## Known Limitations and Deferred Work

- One file per call; a chunked-archive verb (begin/push/finish) is the follow-up if templates routinely carry thousands of files.
