---
description: "SDKWork deploy publishing plugin: the session-header publish icon in the right utility cluster (left of the Session-log ellipsis icon) whose hover menu starts the four deployment flows (create app, upload code, publish app, publish as template), reusing the @sdkwork/deployments-pc-console-publishing dialogs with host-constructed deploy/drive clients and persisting deploy_app / deploy_app_template ids into the project manifest."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

English | [中文](README.zh.md)

## Summary

This plugin adds the SDKWork deploy entry to the Web GUI: a rocket icon in the conversation header's right utility cluster, just left of the Session-log ellipsis icon. Hovering the icon opens a dropdown with the four deployment flows (the shared dialogs come from the `sdkwork-deployments` PC application, `@sdkwork/deployments-pc-console-publishing`):

0. **Create app** — registers the `deploy_app` only (`CreateAppDialog`): type, category, media, description. No code upload.
1. **Upload code** — resolves the linked app and opens `UploadSourceDialog`, the real upload chain (Drive upload session → `deploy_artifact` → optional release/deployment).
2. **Publish app** — cuts a release/deployment from the linked app's registered packages (`AppPublishDialog`).
3. **Publish as template** — mounts the shared `PublishTemplateFlow`: the linked app resolves from the project manifest (picker fallback), then `PublishTemplateDialog` creates the `deploy_app_template` — category, platform targets, display copy, visibility, an initial version record, and the template SOURCE: the app's current code (default), a local `.zip` archive, a local directory packed `.gitignore`-aware in the browser, or a git repository binding — and optionally submits it for review.

The full publish dialog (`CreateDeployAppDialog`) and the publish-as-template flow both remain available through the `deployPublish` service (`open` / `openTemplate`) for the workspace and session row menus, so the sidebar rows and the header run the same code. The dialog itself supports:

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

Mount this plugin alongside the runtime (one cordis.yml row plus a dependency on this package); the deploy icon then appears in the session header utility cluster on the right. Hovering it opens the flow menu; every flow persists its outcome into the target project's `sdkwork.app.config.json` (`deploy` section plus `backend.appId`) through the host workspace bridge, so the next run relates the linked `deploy_app` / `deploy_app_template` by ID instead of creating duplicates. The upload-code and publish-as-template flows resolve the target app by that persisted ID first and fall back to the in-plugin app picker when it no longer resolves. The row menus' publish service (`deployPublish.openTemplate`) resolves and persists against the row's own project directory, while the header flows target the current session's project.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/DeployPublishAction.tsx` — the header trigger with the hover menu and the flow orchestration (create/upload/publish resolve inline; the template flow mounts the shared component).
- `src/client/PublishTemplateFlow.tsx` — the shared publish-as-template flow (manifest resolution → picker fallback → `PublishTemplateDialog` → manifest write-back); mounted by the header and by the `deployPublish.openTemplate` service the row menus consume.
- `src/client/deployHost.ts` — environment/IAM adapter, client construction (mirrors `ui-sdkwork-drive`), and the manifest read/write bridge (`readDeployLink`/`writeDeployLink` take an explicit project directory, defaulting to the session cwd).
- `src/client/deployAppConfig.ts` — the linkage persistence standard: the `deploy` section of the project's `sdkwork.app.config.json` (`appId`/`appName`/`appSlug`/`templateId`/`templateKey` plus the optional `templateGitUrl`/`templateGitBranch`/`templateSubDirectory` provenance of a git-published template, kept in sync with the legacy `backend.appId` slot), parsed and merged in place so every other manifest section is preserved.
- `src/client/PublishTemplateDialog.tsx` — the template publish form: category from `templateCategories.list`, platform-target chips, version + changelog, and the four source modes; archive sources upload through `createDeployAppOperationsService.uploadCodeFromArchive` and a git source binds through `connectGitSource`.
- `src/client/gitignore.ts` — the `.gitignore` matcher (negation, directory-only, anchoring, `**`, deeper-file override) used by the directory packer.
- `src/client/directoryArchive.ts` — the directory → zip packer: subtree-scoped ignore cascade with git's directory pruning, `.git` always dropped, size-capped, SHA-256 checksummed.
- `src/client/templatePlatforms.ts` — the platform-target vocabulary (storefront-canonical four plus the remaining SDKWork app families) and its mapping onto artifact package types.
- `src/client/templateInstall.ts` — the consume-side foundation: artifact download through the Drive content API (an artifact carries its `driveNodeId`, so a published template installs without any extra backend endpoint), fflate unzip, zip-slip and platform-name screening, expansion caps, and the text/binary write split a target-directory writer executes.
- `src/client/deployPorts.ts` — the reactive theme/locale ports and the locale→deployments-locale mapping shared by every publish surface.
- `src/client/DeployAppPickerDialog.tsx` — the app resolution step when the manifest carries no linked app (or the linked one no longer resolves).
- The create/upload dialogs live in `@sdkwork/deployments-pc-console-publishing`; this package supplies clients, locale, theme, the directory-picker port, and the persistence.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The browser directory picker (`showDirectoryPicker`) only exposes the folder name, not the absolute path; the dialog keeps the path input editable so users can complete it.
- Category taxonomy is declarative data in the deployments package; swapping to a server-driven catalog (e.g. appstore) is a data-source change only.
- Template versions carry `platformTargets` as free-form strings server-side; the vocabulary is enforced client-side only (`templatePlatforms.ts`), so the deployments server could tighten it to an enum.
- "Use a template to create a project" has one remaining host dependency: the download (artifact `driveNodeId` through the Drive content API), unzip, safety screening, and write planning all run client-side (`templateInstall.ts`), but writing the planned files needs the Host write bridge — text files can already ride the governed `writeTextFile`, while binary entries (icons, fonts) await a bounded binary-write capability on the `directoryPicker` seam or a fork-owned scaffold Remote. A git-published template also records its repository, branch, and subdirectory in the project manifest, which is the local packaging spec a follow-up scaffold flow (or `create-sdkwork-app`) consumes.

## Runtime invariants

No runtime invariant companion is published; this package is a UI plugin whose session-header entry only opens the shared create-deploy-app dialog; it owns no cross-plugin mutable state, and its single slot registration proves disposal through the HMR-safety spec.

## Dev Note

The dialog is a browser-only surface: it renders through the shared `ui-primitives` dialog primitive, consumes the deploy-app catalog from the deployments package, and opens the create flow through the session-header entry, so no host-side deployment state lives here.
