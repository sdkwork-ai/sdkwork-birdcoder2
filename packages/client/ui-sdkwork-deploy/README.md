---
description: "SDKWork deploy publishing plugin: the session-header publish icon that opens the create-deploy-app dialog, reusing the @sdkwork/deployments-pc-console-publishing component with host-constructed deploy/drive clients."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

English | [中文](README.zh.md)

## Summary

This plugin adds the SDKWork "publish application" entry to the Web GUI: a rocket icon at the right of the session log in the conversation header. Clicking it opens the shared `CreateDeployAppDialog` (defined in the `sdkwork-deployments` PC application, `@sdkwork/deployments-pc-console-publishing`) which supports:

1. Source directory selection (changeable; associate an existing `deploy_app` or create a new one with a name).
2. Application type: static resources, mini programs, Flutter iOS/Android, native iOS/Android, HarmonyOS, SPA, API service.
3. Multi-level category cascade (persisted in `deploy_app.metadata.category`).
4. App icon upload.
5. Cover image upload.
6. Screenshots/previews per App Store preview guidelines (size validation + up to 10 per target).
7. Version number (semver validated).
8. Application description.
9. Release notes.

The host adapter (`deployHost.ts`) constructs the generated deploy and drive clients from the shared `ui-sdkwork-env` and `ui-sdkwork-iam` services through the global token manager, so the dialog stays host-agnostic and reusable. All persistence goes through the existing `sdkwork-deployments` table structure (`deploy_app`, `deploy_app_platform_target`, `deploy_app.metadata` JSONB) and the deploy app-api OpenAPI contract.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the runtime (one cordis.yml row plus a dependency on this package); the publish icon then appears in the session header action strip. A click opens the dialog; submitting creates (or associates) the `deploy_app`, uploads media through Drive, and writes the metadata.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/DeployPublishAction.tsx` — the header trigger and dialog host.
- `src/client/deployHost.ts` — environment/IAM adapter and client construction (mirrors `ui-sdkwork-drive`).
- The dialog itself lives in `@sdkwork/deployments-pc-console-publishing`; this package only supplies clients, locale, theme, and a directory-picker port.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The browser directory picker (`showDirectoryPicker`) only exposes the folder name, not the absolute path; the dialog keeps the path input editable so users can complete it.
- Category taxonomy is declarative data in the deployments package; swapping to a server-driven catalog (e.g. appstore) is a data-source change only.

## Runtime invariants

No runtime invariant companion is published; this package is a UI plugin whose session-header entry only opens the shared create-deploy-app dialog; it owns no cross-plugin mutable state, and its single slot registration proves disposal through the HMR-safety spec.
