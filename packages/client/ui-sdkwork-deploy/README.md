---
description: "SDKWork publish plugin: one state-aware publish entry in the session header (and the row menus) that reads the project's sdkwork.app.config.json, publishes the app already registered there, or runs a manifest-filled create step (record + platform target + linkage) and continues into publish; the linkage is written to the canonical metadata.publishing.appIdByTarget map, and creation is refused once a project owns an app."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

English | [中文](README.zh.md)

## Summary

Publishes a project's app from its own manifest: click the header rocket icon (or the row-menu publish entry) and the plugin publishes the app the project already records, or creates it from `sdkwork.app.config.json` — name, type, description, key — registers its platform target, and continues into the publish dialog. A project that already owns an app never sees a create action. Use it when a BirdCoder project should reach SDKWork deployments without retyping what the repository governs. The app id is written into the manifest's canonical `metadata.publishing.appIdByTarget` map.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the runtime (one cordis.yml row plus a dependency on this package). The header icon opens a click menu; its rows come from the current session project's manifest, and the header's flow targets that session's project while a row menu's flow targets the row's own directory.

- **No recorded app**: one row, 创建应用并发布. The manifest supplies the draft (display name, type card derived from `appType` / `runtime` / `publish.platforms`, description, app key); the confirmation creates the app, or hands off to the console's full create form when the manifest cannot determine a type card.
- **Recorded app that resolves**: 发布应用, 上传代码 and 发布为模板. No create action is rendered, and the flow re-reads the manifest immediately before creating, so a project that acquired an app in another window cannot be given a second one.
- **Recorded app that no longer resolves**: replacement creation that rewrites the same linkage entry.

The canonical linkage lives in the app manifest (APP_MANIFEST_SPEC §4.1): `metadata.publishing.appIdByTarget[<mode>.<environment>]` holds the platform app id, and `metadata.publishing.birdcoder` beside it records the fork-owned display and template provenance. The deployment profile key is the manifest's `runtime.defaultDeploymentProfile` plus the host's active lifecycle tier (`testing` maps to `test`). Earlier plugin versions wrote a top-level `deploy` section and overwrote `backend.appId`; reads still accept the legacy section, and the first write folds it into the canonical block and removes the unknown top-level key. The IAM application id in `backend.appId` is left untouched.

Creation is one operation with three persisted facts, in order: the `deploy_app` record, the project linkage, then the platform target for the manifest's type card. A failed linkage write keeps the created app and offers **重试写入项目关联**, so a retry can never register a second app. When the manifest cannot determine a type card (an ambiguous mobile root, or no manifest at all), the confirmation hands off to the console's full create form.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/DeployPublishAction.tsx` — the header trigger and its click menu; rows derive from the manifest state, and each row mounts the flow with its requested surface.
- `src/client/DeployProjectAppFlow.tsx` — the state machine every entry point runs: resolve the recorded app (publish/upload directly), otherwise confirm creation from the manifest draft, then continue into the requested surface.
- `src/client/DeployProjectAppDialog.tsx` — the create confirmation: manifest-derived name/key/description, the stale-linkage notice, the linkage-retry state, and the full-form handoff.
- `src/client/projectApp.ts` — pure manifest interpretation: governed identity, the recorded app id, and the manifest-vocabulary → console type-card mapping.
- `src/client/projectAppCreate.ts` — the create operation: duplicate guard, record, linkage, platform target, and recoverable failure facts.
- `src/client/deployAppConfig.ts` — the linkage standard: canonical `metadata.publishing.appIdByTarget`, the fork provenance block, legacy `deploy` / `backend.appId` readers, and the in-place merge that preserves every other manifest section.
- `src/client/PublishTemplateFlow.tsx` — the shared publish-as-template flow (manifest resolution → picker fallback → `PublishTemplateDialog` → manifest write-back); the header and the row menus' `deployPublish.openTemplate` both mount it. Host notifications re-read the clients, so a late IAM hydration or a token rotation re-syncs the private token manager and remounts the picker for a clean retry.
- `src/client/deployHost.ts` — environment/IAM adapter, client construction (mirrors `ui-sdkwork-drive`), the project-state read (`readProjectApp`), and the manifest read/write bridge (`readDeployLink`/`writeDeployLink` take an explicit project directory, defaulting to the session cwd).
- `src/client/DeployPublishDialog.tsx` — the standalone publish surface over `CreateDeployAppDialog`; when the linked app is resolved it is passed through, so the dialog's app-selection step is skipped.
- `src/client/PublishTemplateDialog.tsx` — the template publish form: category from `templateCategories.list`, platform-target chips, version + changelog, and the four source modes; archive sources upload through `createDeployAppOperationsService.uploadCodeFromArchive` and a git source binds through `connectGitSource`.
- `src/client/gitignore.ts` — the `.gitignore` matcher (negation, directory-only, anchoring, `**`, deeper-file override) used by the directory packer.
- `src/client/directoryArchive.ts` — the directory → zip packer: subtree-scoped ignore cascade with git's directory pruning, `.git` always dropped, size-capped, SHA-256 checksummed.
- `src/client/templatePlatforms.ts` — the platform-target vocabulary (storefront-canonical four plus the remaining SDKWork app families) and its mapping onto artifact package types.
- `src/client/templateInstall.ts` — the consume-side foundation: artifact download through the Drive content API (an artifact carries its `driveNodeId`, so a published template installs without any extra backend endpoint), fflate unzip, zip-slip and platform-name screening, expansion caps, and the text/binary write split a target-directory writer executes.
- `src/client/deployPorts.ts` — the reactive theme/locale ports and the locale→deployments-locale mapping shared by every publish surface.
- `src/client/DeployAppPickerDialog.tsx` — the app resolution step for the template flow when the manifest carries no linked app (or the linked one no longer resolves). Both plugin dialogs derive their light/dark palette from the `data-theme` root (`DeployDialogs.module.css`).
- The publish/upload dialogs live in `@sdkwork/deployments-pc-console-publishing`; this package supplies clients, locale, theme, the directory-picker port, and the persistence.

### Runtime invariants

No runtime invariant companion is published; this package is a UI plugin whose session-header entry only opens the shared publish flow. It owns no cross-plugin mutable state, and its single slot registration proves disposal through the HMR-safety spec.

## Model Experience

None, as the plugin renders human-facing publishing dialogs and writes deployment records and the project manifest; it adds no prompt content, tools, or session events.

#### KV Cache effect

None; SDKWork deployment requests and manifest writes are separate browser traffic and do not alter Harness provider requests.

## Known Limitations and Deferred Work

- The linkage is recorded under one profile per project: the manifest's default deployment mode plus the host's active lifecycle tier. A project that also publishes to another profile from the deployments console keeps that entry under its own key, and reads prefer the host's profile before falling back to a single or same-mode entry.
- Creation carries the manifest identity (name, app type, description, key) plus the platform target. Category and media (icon, cover, screenshots) are not imported from the manifest's `media` URLs; the deployments console's app row still owns those uploads.
- The browser directory picker (`showDirectoryPicker`) only exposes the folder name, not the absolute path; the dialog keeps the path input editable so users can complete it.
- Category taxonomy is declarative data in the deployments package; swapping to a server-driven catalog (e.g. appstore) is a data-source change only.
- Template versions carry `platformTargets` as free-form strings server-side; the vocabulary is enforced client-side only (`templatePlatforms.ts`), so the deployments server could tighten it to an enum.
- "Use a template to create a project" has one remaining host dependency: the download (artifact `driveNodeId` through the Drive content API), unzip, safety screening, and write planning all run client-side (`templateInstall.ts`), but writing the planned files needs the Host write bridge — text files can already ride the governed `writeTextFile`, while binary entries (icons, fonts) await a bounded binary-write capability on the `directoryPicker` seam or a fork-owned scaffold Remote. A git-published template also records its repository, branch, and subdirectory in the project manifest, which is the local packaging spec a follow-up scaffold flow (or `create-sdkwork-app`) consumes.

### Dev Note

The dialogs are browser-only surfaces: they render the shared `@sdkwork` publishing components, consume the deploy-app catalog from the deployments package, and open through the session-header entry and the `deployPublish` service, so no host-side deployment state lives here.
