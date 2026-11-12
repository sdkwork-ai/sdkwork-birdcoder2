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

Each candidate is matched to the caller's own platform app — manifest linkage, then the governed key against the server slug/name, then the display name — and deduped against the caller's template listings by template key. A publish run then:

1. registers the platform app when none matches, falling back from an ambiguous multi-platform manifest to its first concrete declared platform (`ANDROID_APP`, `IOS_APP`, …) so a Flutter root is still publishable;
2. packs the app root through the Host bridge (`sdkworkTemplateInstall.listFiles`/`readFiles`) with the same `.gitignore`-aware packer a browser-picked directory uses, excluding `.env`/`*.local` overrides and key material, and refusing a listing the Host cut at its 20,000-file / 24-level bound;
3. uploads the archive as the template version's artifact;
4. creates the listing, or updates the existing listing and appends a new version when the account already owns that key (a concurrent creation is re-read and adopted);
5. optionally submits for review; and
6. writes the app id, template id/key/name/version into the app root's own `metadata.publishing` block.

The row's default version is the next patch of the existing template's latest **semantic** version, read from `deploy_app_template_version.template_version` (the listing's `version` field is an optimistic-lock counter and is never treated as a version number). The app manifest's recorded `templateVersion` is the offline fallback.

### Install: one app root under `apps/`, never the project root

The install tab lists the caller's templates and the public marketplace. Under the default target the archive lands in `<project>/apps/<templateKey>`; a taken directory gets `-2`, `-3`, … rather than overwriting a local application. A custom absolute directory is also supported and overwrites same-named files there.

After the files land, the installer records the template identity in the installed `agent.app.config.json` (only when the archive carried a parsable manifest — it never fabricates one), validates that manifest, and upserts the app's row in `apps/README.md` with the role derived from the directory suffix and card ([`templateDownload.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/templateDownload.ts), [`appsIndex.ts`](../../../../packages/client/ui-sdkwork-deploy/src/client/appsIndex.ts)). Custom targets skip the index because they are not part of the project tree.

### Host capability and product surface

`packages/host/sdkwork-template-install` gains two bounded reads beside `writeFile`: `listFiles` (sorted, symlink-free, skip-listed walk) and `readFiles` (64 paths / 32 MiB per batch, 64 MiB for one file). The controller exposes them over the same `sdkworkTemplateInstall` Remote; the existing install planner needs no new endpoint. The browser packs the read batches lazily through the existing `packDirectory`.

The center is one modal with a dark/light token palette, app cards with checkboxes, type/platform/version badges, dedupe state, per-app editable values, shared category/visibility/review settings, live per-stage progress, skeleton and empty/error states, and a responsive single-column fallback. The signed-in account is the author identity and is shown in the header; both tabs require an IAM user session.

## Alternatives considered

- **Keep the single-app template form and add an app multi-select.** Rejected: the form's sources (archive, git, browser-picked directory) still bypass the `apps/` layout and the dedupe that makes repeat publishing safe.
- **Host-side zip creation.** Rejected: the browser already owns `.gitignore` selection, zip-slip/secret screening, and SHA-256; re-implementing that walk and matcher on the Host would create a second, divergent packer. Listing plus bounded reads keeps one packer and no new host dependency.
- **Read every file through one RPC.** Rejected: one call per file would multiply round trips without bounds; batches amortize the IPC/HTTP cost while the capability keeps per-file and per-batch caps.
- **Reuse only the manifest's `latestVersionUuid` as a version number.** Rejected: the uuid is not a version. The center reads the semantic `template_version` for existing listings and records it in the app manifest for offline dedupe.
- **Overwrite the existing `apps/<key>` directory on install.** Rejected: overwriting a local application is destructive and hard to reverse; the numeric suffix keeps both, and the operator can delete the old directory deliberately.
- **Write an app manifest when the archive has none.** Rejected: it would fabricate an identity (`app`/`app`) the scaffold never declared; the install reports the gap and leaves the file absent.
- **Require every app root to be pre-linked in the deployments console.** Rejected for multi-platform roots: the console card vocabulary does not cover Flutter/multi-mobile, so the first declared platform is used as the lineage record and the template's own `platformTargets` keep the full surface.

## Consequences

- Publishing from a project needs the Host packaging bridge. A composition without `sdkwork-template-install` still opens the center but cannot pack; the row reports the host failure.
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
- `template-download.client.spec.ts` pins target planning, suffix avoidance, manifest/link reconciliation, and the `apps/README.md` update; `template-download-panel.client.spec.tsx` runs a real `installTemplateVersion` end to end over stub clients.
- `template-center-dialog.client.spec.tsx` pins the publish run, failure row, tab retention, semantic-version enrichment, and the disabled empty selection; `publish-template-flow.client.spec.tsx` pins late IAM hydration over the real generated SDK stack.
- `packages/host/sdkwork-template-install/tests/template-source.host.spec.ts` and the controller suite pin the bounded walk, batched reads, symlink refusal, and wire error projection.

## Prior art

- [The one state-aware project publish entry](2026-10-23-project-publish-entry-and-canonical-app-linkage.md) owns the `deployPublish` service, canonical app linkage, and the publish/upload state machine this center leaves unchanged; the template row now opens this note's center instead of that flow.
