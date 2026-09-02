---
description: "SDKWork share plugin: the session-header share icon (right of the publish action) with a popover that copies the session ID and lists recently published deploy_app records."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-share

English | [中文](README.zh.md)

## Summary

This plugin adds the SDKWork "share" entry to the Web GUI: a share icon in the session header action strip, immediately to the right of the publish-application action. Clicking it opens a popover with two sections:

1. Current session: copy the session ID.
2. Recently published applications: lists up to five `deploy_app` records (best-effort through the deploy app API) with one-click copy of each application ID — so an app that was just published can be shared right away.

The host adapter (`shareHost.ts`) constructs the generated deploy client from the shared `ui-sdkwork-env` and `ui-sdkwork-iam` services through the global token manager, matching the `ui-sdkwork-deploy` pattern.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the runtime (one cordis.yml row plus a dependency on this package); the share icon then appears to the right of the publish icon in the session header. A click opens the popover.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/ShareAction.tsx` — the header trigger and popover.
- `src/client/shareHost.ts` — environment/IAM adapter and deploy client construction (mirrors `ui-sdkwork-deploy`).
- The plugin lists applications through the generated `deployments-app-sdk`; no new backend contract is introduced.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Share targets are currently IDs (session / application). A durable share-link scheme (deep links into the deployed app) can be added once the app store surface defines one.
- The recent-apps list is best-effort: it is empty when the publishing service is unreachable.
