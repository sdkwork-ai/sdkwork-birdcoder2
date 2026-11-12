# Agent Note: The app template center — scaffold publish from `apps/` and install back into it

Status: implemented

English | [中文](2026-11-12-app-template-center-scaffold-publish-install.zh.md)

## Problem

The row menu's 发布为模板 action was a single-app flow: resolve the project's one linked `deploy_app`, open a form whose source modes were "the app's current code", a local `.zip`, a browser-picked directory, or a git repository, and record the template on the *project* manifest. It could not answer the SDKWork workspace shape a project actually has: `apps/` is a collection of independent application roots, each with its own `agent.app.config.json`, and an app-development scaffold template is one such root's source tree — not a deployable bundle, and not the root project's manifest.

Three gaps followed. The flow listed nothing from `apps/`, so publishing five app roots meant five manual folder picks. The browser cannot read an arbitrary app folder's bytes, so "publish from the project directory" had no packaging path. And there was no consume side at all: a published template's archive could be downloaded and unzipped, but nothing chose `apps/<key>`, reconciled the installed manifest, or updated the repository's `apps/README.md` directory index — so a downloaded scaffold did not join the workspace the way a generated one does.

## Decision

One **app template center** opens from both row-menu actions (`发布为模板` on its publish tab, `从模板安装` on its install tab) through `deployPublish.openTemplate`. It owns two account-scoped directions.

### Publish: discover, dedupe, pack, upload, version

The publish tab scans `<project>/apps` (falling back to the project root only when `apps/` is absent). A child is an independent app root when it carries a parsable `agent.app.config.json`; a child the directory index marks `role: common` is a shared package family and stays ignored, as do incomplete roots. The scan reports the ignored count rather than silently listing them ([`templateApps.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateApps.ts)).

A second source covers apps that do not live under `apps/`. The operator picks any absolute directory through the Host directory picker; [`templateCustomApp.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateCustomApp.ts) lists it through the same bounded Host walk, reads a small marker set (`agent.app.config.json`, `package.json`, `pubspec.yaml`, platform project files), and builds the same candidate shape. A valid manifest wins outright. Without one, project markers infer the type — Flutter with its platform folders, React Native/Expo, mini program, Android, iOS, HarmonyOS, Electron/Tauri, web framework, static HTML, or server framework — and the operator sees the evidence and can override the type from a fixed vocabulary. An unknown directory stays a valid candidate with no type until one is chosen, so the next button and publish action explain the block rather than failing after packaging.

Each candidate is matched to the caller's own platform app — manifest linkage, then the governed key against the server slug/name, then the display name — and deduped against the caller's template listings by template key. A publish run then:

1. registers the platform app when none matches, falling back from an ambiguous multi-platform manifest to its first concrete declared platform (`ANDROID_APP`, `IOS_APP`, …) so a Flutter root is still publishable;
2. packs the app root through the Host bridge (`sdkworkTemplateInstall.listFiles`/`readFiles`) with the same `.gitignore`-aware packer a browser-picked directory uses, excluding `.env`/`*.local` overrides and key material, and refusing a listing the Host cut at its 20,000-file / 24-level bound; the packer builds a zip locally with fflate and reports the compressed file count and byte size before any network write;
3. uploads only that locally built zip as the template version's artifact;
4. creates the listing, or updates the existing listing and appends a new version when the account already owns that key (a concurrent creation is re-read and adopted);
5. optionally submits for review; and
6. writes the app id, template id/key/name/version into the app root's own `metadata.publishing` block.

The row's default version is the next patch of the existing template's latest **semantic** version, read from `deploy_app_template_version.template_version` (the listing's `version` field is an optimistic-lock counter and is never treated as a version number). The app manifest's recorded `templateVersion` is the offline fallback.

### Install: one app root under `apps/`, never the project root

The install tab lists the caller's templates and the public marketplace. Under the default target the archive lands in `<project>/apps/<templateKey>`; a taken directory gets `-2`, `-3`, … rather than overwriting a local application. A custom absolute directory is also supported and overwrites same-named files there.

After the files land, the installer records the template identity in the installed `agent.app.config.json` (only when the archive carried a parsable manifest — it never fabricates one), validates that manifest, and upserts the app's row in `apps/README.md` with the role derived from the directory suffix and card ([`templateDownload.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateDownload.ts), [`appsIndex.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/appsIndex.ts)). Custom targets skip the index because they are not part of the project tree.

### Host capability and product surface

`packages/host/sdkwork-template-install` gains two bounded reads beside `writeFile`: `listFiles` (sorted, symlink-free, skip-listed walk) and `readFiles` (64 paths / 32 MiB per batch, 64 MiB for one file). The controller exposes them over the same `sdkworkTemplateInstall` Remote; the existing install planner needs no new endpoint. The browser packs the read batches lazily through the existing `packDirectory`.

The publish surface is its own dialog with a dark/light token palette. Publish is a three-stage wizard — select project app cards (checkbox, icon, type/platform/version badges, dedupe state) or pick one custom directory (path, scan count, detected type with manual override and manifest warnings), configure one app at a time in a selection rail plus editor with shared category/visibility/review settings, then read a live result ledger with overall and per-row progress, retry-failed and publish-another-batch actions. Each stage has its own footer so the primary action never scrolls away; a short viewport falls back to a single column, a horizontally scrolling app rail, and full-width footer buttons. The signed-in account is the author identity and is shown in the header. Install is now a separate dialog, not a tab of this surface (see [the independent-dialogs note](2026-11-13-independent-template-publish-install-dialogs.md)).

## Alternatives considered

- **Keep the single-app template form and add an app multi-select.** Rejected: the form's sources (archive, git, browser-picked directory) still bypass the `apps/` layout and the dedupe that makes repeat publishing safe.
- **Require every template source to live under `apps/`.** Rejected: the user requirement explicitly includes one-off custom directories, and a separate picker is the only way to publish a scaffold that has not been moved into the workspace yet.
- **Detect the type only on the Host.** Rejected: detection is a few marker reads, and doing it in the client keeps the Host capability a dumb bounded reader; the same list/read bridge already exists for packaging.
- **Upload the raw directory tree instead of a zip.** Rejected: the artifact contract is a single archive with a checksum; local compression also lets the operator see the file count/size before the network call.
- **Host-side zip creation.** Rejected: the browser already owns `.gitignore` selection, zip-slip/secret screening, and SHA-256; re-implementing that walk and matcher on the Host would create a second, divergent packer. Listing plus bounded reads keeps one packer and no new host dependency.
- **Read every file through one RPC.** Rejected: one call per file would multiply round trips without bounds; batches amortize the IPC/HTTP cost while the capability keeps per-file and per-batch caps.
- **Reuse only the manifest's `latestVersionUuid` as a version number.** Rejected: the uuid is not a version. The center reads the semantic `template_version` for existing listings and records it in the app manifest for offline dedupe.
- **Overwrite the existing `apps/<key>` directory on install.** Rejected: overwriting a local application is destructive and hard to reverse; the numeric suffix keeps both, and the operator can delete the old directory deliberately.
- **Write an app manifest when the archive has none.** Rejected: it would fabricate an identity (`app`/`app`) the scaffold never declared; the install reports the gap and leaves the file absent.
- **Require every app root to be pre-linked in the deployments console.** Rejected for multi-platform roots: the console card vocabulary does not cover Flutter/multi-mobile, so the first declared platform is used as the lineage record and the template's own `platformTargets` keep the full surface.

## Consequences

- Publishing from a project needs the Host packaging bridge. A composition without `sdkwork-template-install` still opens the center but cannot pack; the row reports the host failure.
- Custom-directory detection is a heuristic over names and a few marker files, not a build-system evaluation. A project with several frameworks, a monorepo root, or an unusual layout can be misclassified; the type select is the correction path, and an untyped candidate cannot advance until a type is chosen.
- A custom directory without `agent.app.config.json` is never given a fabricated manifest and its app/template linkage is not written; the UI says so before publishing and the account-scoped template key still dedupes the next run.
- Custom detection and packaging share the Host skip list and bounds, so a directory dominated by ignored build output can look empty or be refused exactly like an `apps/` root.
- The host walk bounds the complete result at 20,000 files and 24 levels; an app beyond either bound is refused rather than published incomplete. Read batches are bounded at 64 paths / 32 MiB.
- Dedupe is account-scoped and key-based. Two selected roots claiming one key block both rows instead of merging their versions.
- `.env` and `*.local` overrides plus key material are always excluded; checked-in `.env.<mode>.<environment>` profiles remain scaffold source, and the app's `.gitignore` decides everything else.
- An app root that declares neither a console card nor a platform cannot be registered and is disabled with a "link it in the deployments console" state.
- Installed templates are not upgrades of an existing app directory; a repeat install creates a suffixed sibling. Custom targets are outside the project index.
- The marketplace list is the first 50 results per search and the owned list is capped at five pages of 100; larger catalogs stay in the deployments console.

## Verification

- `packages/client/ui-sdkwork-deploy/tests/template-apps.client.spec.ts` pins the `apps/` scan, the common-role exclusion, the fallback root, and the ignored reasons.
- `apps-index.client.spec.ts` pins the directory-index parse and in-place upsert; `host-archive.client.spec.ts` pins batching, secret exclusion, truncation, and cap failures.
- `template-publish.client.spec.ts` pins platform-app matching, key dedupe, semantic version bumps, the create/update/version chain, slug-race adoption, and warning isolation.
- `template-download.client.spec.ts` pins target planning, suffix avoidance, manifest/link reconciliation, and the `apps/README.md` update; `template-install-panel.client.spec.tsx` runs a real `installTemplateVersion` end to end over stub clients.
- `template-publish-dialog.client.spec.tsx` pins the three-stage navigation, semantic-version validation, publish run, failure row, retry-only-failed action, reset-to-selection, version enrichment, the disabled empty selection, the custom-directory pick/detect/publish path (no manifest write), and the manual type override; `publish-template-flow.client.spec.tsx` pins late IAM hydration over the real generated SDK stack.
- `template-custom-app.client.spec.ts` pins Flutter/React/mini/Expo detection, manifest precedence, the untyped candidate, empty/unreadable refusal, truncation, and the type vocabulary; `template-publish.client.spec.ts` pins the new local-zip stage between packing and upload.
- `packages/host/sdkwork-template-install/tests/template-source.host.spec.ts` and the controller suite pin the bounded walk, batched reads, symlink refusal, and wire error projection.

## Prior art

- [The one state-aware project publish entry](2026-10-23-project-publish-entry-and-canonical-app-linkage.md) owns the `deployPublish` service, canonical app linkage, and the publish/upload state machine this note leaves unchanged; the template row now opens this note's surfaces instead of that flow.
- [Publish and install are independent template dialogs](2026-11-13-independent-template-publish-install-dialogs.md) supersedes this note's single tabbed center: the publish mechanics and install execution remain here, while the frame is now two dialogs.
