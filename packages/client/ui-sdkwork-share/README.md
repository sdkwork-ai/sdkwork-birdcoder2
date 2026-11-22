---
description: "SDKWork share plugin: the session-header share icon in the right utility cluster (right of the publish icon, left of the Session-log ellipsis icon) with a popover that copies the session ID and lists recently published deploy_app records."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-share

English | [中文](README.zh.md)

## Summary

Adds the SDKWork share entry to the Web GUI: a share icon in the session header utility cluster, right of the publish-application icon and left of the Session-log ellipsis. Clicking it opens a popover that copies the current session ID and lists up to five recently published `deploy_app` records, each with one-click copy of its application ID, so an app that was just published can be shared right away.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the runtime (one cordis.yml row plus a dependency on this package); the share icon then appears to the right of the publish icon in the session header utility cluster. A click opens the popover.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/ShareAction.tsx` — the header trigger and popover.
- `src/client/shareHost.ts` — environment/IAM adapter and deploy client construction (mirrors `ui-sdkwork-deploy`).
- The plugin lists applications through the generated `deployments-app-sdk`; no new backend contract is introduced.

This plugin adds the SDKWork "share" entry to the Web GUI: a share icon in the session header utility cluster on the right, immediately to the right of the publish-application icon and left of the Session-log ellipsis icon. Clicking it opens a popover with two sections:

1. Current session: copy the session ID.
2. Recently published applications: lists up to five `deploy_app` records (best-effort through the deploy app API) with one-click copy of each application ID — so an app that was just published can be shared right away.

The host adapter (`shareHost.ts`) constructs the generated deploy client from the shared `ui-sdkwork-env` and `ui-sdkwork-iam` services through the global token manager, matching the `ui-sdkwork-deploy` pattern.

## Runtime invariants

No runtime invariant companion is published; this package is a UI plugin whose session-header entry opens a share popover; it owns no cross-plugin mutable state, and its single slot registration proves disposal through the HMR-safety spec.

## Dev Note

The popover is browser-only: it reads the session ID from the shell-shared session context and lists deploy_app records through the deploy app API, so no host-side publication state lives in this package.

## Model Experience

None, as the package is browser-only session-header chrome whose popover copies identifiers and lists deploy records without contributing prompts, tools, or session events.

#### KV Cache effect

None; the package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- Share targets are currently IDs (session / application). A durable share-link scheme (deep links into the deployed app) can be added once the app store surface defines one.
- The recent-apps list is best-effort: it is empty when the publishing service is unreachable.
