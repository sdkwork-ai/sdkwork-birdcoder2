---
description: "SDKWork deploy publishing plugin: the session-header publish icon in the right utility cluster (left of the Session-log ellipsis icon) whose hover menu starts the three deployment flows (create app, upload code, publish as template), reusing the @sdkwork/deployments-pc-console-publishing dialogs with host-constructed deploy/drive clients and persisting deploy_app / deploy_app_template ids into the project manifest."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

English | [中文](README.zh.md)

## Summary

This plugin adds the SDKWork deploy entry to the Web GUI: a rocket icon in the conversation header's right utility cluster, just left of the Session-log ellipsis icon. Hovering the icon opens a dropdown with the three deployment flows (all dialogs come from the `sdkwork-deployments` PC application, `@sdkwork/deployments-pc-console-publishing`):

0. **Create app** — registers the `deploy_app` only (`CreateAppDialog`): type, category, media, description. No code upload.
1. **Upload code** — resolves the linked app and opens `UploadSourceDialog`, the real upload chain (Drive upload session → `deploy_artifact` → optional release/deployment).
2. **Publish as template** — resolves the linked app and creates a `deploy_app_template` (category, display copy, visibility) and optionally submits it for review.

The full publish dialog (`CreateDeployAppDialog`) remains available through the `deployPublish` service for the workspace row menus and supports:

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

Mount this plugin alongside the runtime (one cordis.yml row plus a dependency on this package); the deploy icon then appears in the session header utility cluster on the right. Hovering it opens the flow menu; every flow persists its outcome into the current session project's `sdkwork.app.config.json` (`deploy` section plus `backend.appId`) through the host workspace bridge, so the next run relates the linked `deploy_app` / `deploy_app_template` by ID instead of creating duplicates. The upload-code and publish-as-template flows resolve the target app by that persisted ID first and fall back to the in-plugin app picker when it no longer resolves.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/DeployPublishAction.tsx` — the header trigger with the hover menu and the flow orchestration.
- `src/client/deployHost.ts` — environment/IAM adapter, client construction (mirrors `ui-sdkwork-drive`), and the manifest read/write bridge.
- `src/client/deployAppConfig.ts` — the linkage persistence standard: the `deploy` section of the project's `sdkwork.app.config.json` (`appId`/`appName`/`appSlug`/`templateId`/`templateKey`, kept in sync with the legacy `backend.appId` slot), parsed and merged in place so every other manifest section is preserved.
- `src/client/DeployAppPickerDialog.tsx` — the app resolution step when the manifest carries no linked app (or the linked one no longer resolves).
- `src/client/PublishTemplateDialog.tsx` — the template publish form (category from `templateCategories.list`, create + optional submit).
- The create/upload dialogs live in `@sdkwork/deployments-pc-console-publishing`; this package supplies clients, locale, theme, the directory-picker port, and the persistence.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The browser directory picker (`showDirectoryPicker`) only exposes the folder name, not the absolute path; the dialog keeps the path input editable so users can complete it.
- Category taxonomy is declarative data in the deployments package; swapping to a server-driven catalog (e.g. appstore) is a data-source change only.

## Runtime invariants

No runtime invariant companion is published; this package is a UI plugin whose session-header entry only opens the shared create-deploy-app dialog; it owns no cross-plugin mutable state, and its single slot registration proves disposal through the HMR-safety spec.

## Dev Note

The dialog is a browser-only surface: it renders through the shared `ui-primitives` dialog primitive, consumes the deploy-app catalog from the deployments package, and opens the create flow through the session-header entry, so no host-side deployment state lives here.
