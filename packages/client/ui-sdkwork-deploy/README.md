---
description: "SDKWork publish plugin: the session-header trigger opens the app library — a workspace scan lists every project carrying sdkwork.app.config.json with per-row publish, code upload and build actions plus a create-app footer — and the row menus run the state-aware per-project flow: publish the registered app, or create it from the manifest (record + platform target + linkage); the linkage is written to the canonical metadata.publishing.appIdByTarget map, and creation is refused once a project owns an app."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-deploy

English | [中文](README.zh.md)

## Summary

The session-header rocket opens the app library: a bounded workspace scan discovers every project carrying `sdkwork.app.config.json` and lists it with its manifest name, type, icon and linkage state. Each row publishes, uploads code to, or builds that project; the footer creates a new app through the console's full form; an empty scan renders a clickable placeholder with the same action. Creation writes a complete APP_MANIFEST_SPEC v3 manifest — identity, per-type runtime, publish, media and linkage — and the library re-scans live as the session cwd moves.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the runtime (one cordis.yml row plus a dependency on this package). The header icon opens the app library popup; the row-menu publish entry runs the per-project flow against the row's own directory.

**App library (header trigger).** The popup scans the session cwd (depth 3, at most 120 listed directories, pruning hidden and build-output children) for `sdkwork.app.config.json` manifests and lists every project it finds:

- Each row shows the manifest's display name, derived type label (the console type card the manifest maps to), linkage badge, project path, and logo (`app.iconUrl` / `media.icons.primary.url`, falling back to the name's initial).
- The row's right side runs 发布 and 上传代码 through the shared project flow for that directory (creating or linking first when the manifest records no app), and 打包 through the host build port's progress dialog when the composition ships `sdkwork-app-build`.
- An empty scan renders a clickable placeholder whose action is the footer's 新建应用: the console's full create form, whose type grid covers the whole SDKWork app vocabulary (h5, pc-web, desktop, mini-program, android, ios, harmonyos, api-service, static-web, each with its framework stacks). A freshly created app is linked to the session project when that project records no app yet.

**Row-menu project flow.** One flow serves every entry, driven by the project's manifest state:

- **No recorded app**: 创建应用并发布. The manifest supplies the draft (display name, type card derived from `appType` / `runtime` / `publish.platforms`, description, app key); the confirmation creates the app, or hands off to the console's full create form when the manifest cannot determine a type card.
- **Recorded app that resolves**: 发布应用 and 上传代码. The flow re-reads the manifest immediately before creating, so a project that acquired an app in another window cannot be given a second one.
- **Recorded app that no longer resolves**: replacement creation that rewrites the same linkage entry.
- **发布为模板** stays a row-menu action (`deployPublish.openTemplate`); the header popup is the app inventory, not a second menu.

**Creation writes a complete manifest (APP_MANIFEST_SPEC v3).** When the target project records no `sdkwork.app.config.json`, the linkage write composes the full skeleton instead of the linkage-only stub the standard's §4.1 permits: every required section (`app`, `backend`, `runtime`, `media`, `publish`, `artifacts`, `release`, `security`), the identity the created record carries (key derived from the governed key, the name's kebab, or the console slug; name, display name, description, `appType`), the runtime identity the spec's §6.1 client-architecture alignment assigns to the app's type card or kind (family, framework, `publish.platforms`, `supportedDeploymentProfiles` + default `standalone`), the product icon at both icon slots when the create form uploaded one, the canonical `metadata.deploymentConfig` pointer, and the initial `0.1.0` release entry. Fields the creation flow cannot truthfully know — official website, screenshots, the package matrix — stay absent for the app repo's authoring pass; nothing is fabricated. An existing manifest is only merged, never rewritten. Reading a composed manifest back resolves the same type card again, and with the record's icon and website supplied the composed manifests pass `check-app-manifest-standard.mjs` for all nine cards.

**Live list.** The library re-scans when a stacked surface closes and when the session cwd moves (the sessions list feeds the host adapter's change channel), so the window reflects creation, linkage, and session switches without reopening.

The canonical linkage lives in the app manifest (APP_MANIFEST_SPEC §4.1): `metadata.publishing.appIdByTarget[<mode>.<environment>]` holds the platform app id, and `metadata.publishing.birdcoder` beside it records the fork-owned display and template provenance. The deployment profile key is the manifest's `runtime.defaultDeploymentProfile` plus the host's active lifecycle tier (`testing` maps to `test`). Earlier plugin versions wrote a top-level `deploy` section and overwrote `backend.appId`; reads still accept the legacy section, and the first write folds it into the canonical block and removes the unknown top-level key. The IAM application id in `backend.appId` is left untouched.

Creation is one operation with three persisted facts, in order: the `deploy_app` record, the project linkage, then the platform target for the manifest's type card. A failed linkage write keeps the created app and offers **重试写入项目关联**, so a retry can never register a second app. When the manifest cannot determine a type card (an ambiguous mobile root, or no manifest at all), the confirmation hands off to the console's full create form.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/DeployPublishAction.tsx` — the header trigger; it opens the app library popup directly (no menu) and surfaces the library's outcomes as the header banner.
- `src/client/appLibrary.ts` — the file-driven discovery walk: bounded BFS over the workspace scan port that collects every manifest-carrying project (depth, directory, and attempt caps; hidden and build-output pruning) and projects each manifest into a library entry.
- `src/client/DeployAppLibraryDialog.tsx` — the app library popup: the discovered list with logo, type label, linkage badge and per-row 发布 / 上传代码 / 打包 actions, the clickable empty placeholder, and the 新建应用 footer that opens the console's full create form and links the created app to the session project when it records none.
- `src/client/appManifestCompose.ts` — creation-time manifest authoring: the per-type runtime identity table (console type card → spec §6.1 family/framework/platforms/appType, with the `deploy_app` kind as fallback), the complete-skeleton composer for manifest-less projects, the app-key derivation chain, and the merge-only path for existing manifests.
- `src/client/DeployProjectAppFlow.tsx` — the state machine every entry point runs: resolve the recorded app (publish/upload directly), otherwise confirm creation from the manifest draft, then continue into the requested surface.
- `src/client/DeployProjectAppDialog.tsx` — the create confirmation: manifest-derived name/key/description, the stale-linkage notice, the linkage-retry state, and the full-form handoff.
- `src/client/projectApp.ts` — pure manifest interpretation: governed identity, the recorded app id, and the manifest-vocabulary → console type-card mapping.
- `src/client/projectAppCreate.ts` — the create operation: duplicate guard, record, linkage, platform target, and recoverable failure facts.
- `src/client/deployAppConfig.ts` — the linkage standard: canonical `metadata.publishing.appIdByTarget`, the fork provenance block, legacy `deploy` / `backend.appId` readers, and the in-place merge that preserves every other manifest section.
- `src/client/PublishTemplateFlow.tsx` — the shared publish-as-template flow (manifest resolution → picker fallback → `PublishTemplateDialog` → manifest write-back); the header and the row menus' `deployPublish.openTemplate` both mount it. Host notifications re-read the clients, so a late IAM hydration or a token rotation re-syncs the private token manager and remounts the picker for a clean retry.
- `src/client/deployHost.ts` — environment/IAM adapter, client construction (mirrors `ui-sdkwork-drive`), the workspace listing/scan bridge, the project-state read (`readProjectApp`), the manifest read/write bridge (`readDeployLink`/`writeDeployLink` take an explicit project directory, defaulting to the session cwd; `writeDeployLink` composes the complete manifest through the creation identity), the `notifyChange` channel the sessions list feeds, and the build port the app library's 打包 action mounts.
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

- A composed manifest fills only what the creation flow truthfully knows. `app.officialWebsiteUrl` and the primary icon (when the create form uploaded none) stay absent, so the canonical `check-app-manifest-standard.mjs` reports exactly those two fields until the app repo's authoring pass fills them; screenshots and the package matrix are likewise deferred. Nothing is fabricated.
- The library scan is a bounded walk (depth 3, 120 listed directories, 300 listing attempts, hidden and build-output children pruned) driven by the workspace listing bridge, which cannot distinguish files from directories; a file child costs one failed listing. A project nested deeper than the budget lists through the deployments console, not the library.
- The linkage is recorded under one profile per project: the manifest's default deployment mode plus the host's active lifecycle tier. A project that also publishes to another profile from the deployments console keeps that entry under its own key, and reads prefer the host's profile before falling back to a single or same-mode entry.
- Creation carries the manifest identity (name, app type, description, key) plus the platform target. Category and media (icon, cover, screenshots) are not imported from the manifest's `media` URLs; the deployments console's app row still owns those uploads.
- The browser directory picker (`showDirectoryPicker`) only exposes the folder name, not the absolute path; the dialog keeps the path input editable so users can complete it.
- Category taxonomy is declarative data in the deployments package; swapping to a server-driven catalog (e.g. appstore) is a data-source change only.
- Template versions carry `platformTargets` as free-form strings server-side; the vocabulary is enforced client-side only (`templatePlatforms.ts`), so the deployments server could tighten it to an enum.
- "Use a template to create a project" has one remaining host dependency: the download (artifact `driveNodeId` through the Drive content API), unzip, safety screening, and write planning all run client-side (`templateInstall.ts`), but writing the planned files needs the Host write bridge — text files can already ride the governed `writeTextFile`, while binary entries (icons, fonts) await a bounded binary-write capability on the `directoryPicker` seam or a fork-owned scaffold Remote. A git-published template also records its repository, branch, and subdirectory in the project manifest, which is the local packaging spec a follow-up scaffold flow (or `create-sdkwork-app`) consumes.

### Dev Note

The dialogs are browser-only surfaces: they render the shared `@sdkwork` publishing components, consume the deploy-app catalog from the deployments package, and open through the session-header entry and the `deployPublish` service, so no host-side deployment state lives here.
