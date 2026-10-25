# Agent Note: One state-aware project publish entry and canonical app linkage

Status: implemented

English | [中文](2026-10-23-project-publish-entry-and-canonical-app-linkage.zh.md)

## Problem

The session header exposed a hover menu with four deployment flows (create app, upload code, publish app, publish as template), and the workspace/session row menus exposed a separate publish row that opened a different dialog. Creating an app and publishing it were two operations in two dialogs: the create form asked for a name, type, description, media and category the project's `agent.app.config.json` already governs, and after creating, the user had to reopen the publish flow and pick the same app again. Nothing checked whether the project already owned an app, so repeat use registered duplicates; the dialog's own app picker could also associate a row to a different app without touching the manifest.

The linkage itself had drifted from the SDKWork App Manifest standard. The plugin wrote a top-level `deploy` section, which the canonical validator rejects as an unknown top-level field, and overwrote `backend.appId` — the IAM application id, a different identity — with the deploy app uuid. APP_MANIFEST_SPEC §4.1 puts the platform app id in `metadata.publishing.appIdByTarget` keyed by `<mode>.<environment>`.

## Decision

Both surfaces run one state machine, `DeployProjectAppFlow`, and decide from the project manifest alone:

- **No recorded app**: one row, 创建应用并发布. The manifest supplies the draft (display name, type card derived from `appType`/`runtime`/`publish.platforms`, description, app key); a confirmation surface shows it and creates the app, or hands off to the console's full create form when the manifest cannot determine a type card.
- **Recorded app that resolves**: 发布应用, 上传代码 and 发布为模板. No create action is rendered, and the flow re-reads the manifest immediately before creating, so a project that acquired an app in another window cannot be given a second one.
- **Recorded app that no longer resolves**: replacement creation that rewrites the same linkage entry.

Creation is one operation with three persisted facts in a deliberate order: the `deploy_app` record, the project linkage, then the platform target for the resolved type card. Writing the linkage before the target means a later failure can never be repaired by creating again; a failed linkage write keeps the created app and offers 重试写入项目关联, which retries only the manifest write and then registers the missing target.

The linkage follows APP_MANIFEST_SPEC §4.1: `metadata.publishing.appIdByTarget[<mode>.<environment>]` holds the app id, where the profile is the manifest's `runtime.defaultDeploymentProfile` plus the host's active lifecycle tier (`testing` maps to `test`). Fork-owned display and template provenance lives beside it as `metadata.publishing.birdcoder`; `metadata` is free-form in the standard and the publisher merges single target keys while preserving other metadata subtrees. Reads still accept the legacy top-level `deploy` section and a uuid-shaped `backend.appId`; the first write folds them into the canonical block and removes the unknown top-level key. `backend.appId` itself is never written.

The row menus open the same flow through the `deployPublish` service (`open`, `openTemplate`), so the header and the sidebar cannot diverge.

## Alternatives considered

- **Keep the four-flow hover menu and disable the create row when an app exists.** Rejected: it preserves two entry points for the same operation, hides the state behind a hover card, and still opens the publish dialog's app list for a project whose app the manifest already names.
- **Prefill the console's full create form instead of a fork confirmation.** Rejected: `CreateAppDialog` lives in the sibling `sdkwork-deployments` checkout and exposes no initial-value props; adding them there would put this fork's UX requirement into another repository's public component, and the full form still asks for fields the manifest already governs.
- **Create app, then require a second click to publish.** Rejected: that is the two-round-trip behavior the change removes; continuing into publish follows the intent of the row that started it.
- **Write the manifest linkage before creating the app.** Rejected: the linkage value is the app id, which exists only after creation; the duplicate guard and the retry-the-link-only path cover the failure window instead.
- **Keep the top-level `deploy` section for compatibility.** Rejected: the canonical validator rejects unknown top-level fields, so every project the old plugin touched would fail `check-app-manifest-standard`; the legacy reader plus write-time migration covers existing projects without keeping an invalid section.
- **Record only the app id.** Rejected: the offline menu label, the source-directory association, and the published-template identity need a home, and re-fetching them on every menu open would make the label depend on a network call.

## Consequences

- Opening the header menu reads the project manifest; the row labels are one asynchronous read behind, so the trigger shows 正在读取项目 until the state lands.
- Creation can now register a platform target the console's create dialog never wrote, which is what makes the immediately following publish reachable.
- The publish dialog receives the resolved app and therefore skips its app-selection step; a composition without the header (row menus only) gets the same behavior through the service.
- Legacy projects keep working: reads tolerate the old section, and the first write migrates it. A project whose `backend.appId` was overwritten by the old plugin keeps that wrong value; the plugin no longer reads it as a deploy app id once it is non-uuid.
- Category and media (icon, cover, screenshots) are still not imported from the manifest's `media` URLs; they remain uploads on the deployments console's app row.

## Verification

`packages/client/ui-sdkwork-deploy/tests/deploy-app-config.client.spec.ts` pins the canonical read/write, the legacy migration, the unaffected `backend.appId`, and the profile selection. `project-app.client.spec.ts` pins the manifest identity and the type-card mapping, `project-app-create.client.spec.ts` the duplicate guard and failure facts, and `deploy-project-app-flow.client.spec.tsx` runs the create → link → platform-target → publish chain against a real generated SDK client and a local gateway, including the duplicate guard, the linkage retry, and the target failure. `deploy-project-app-dialog.client.spec.tsx` covers the confirmation surfaces. The written manifest fields are the ones the SDKWork validator accepts: `node ../sdkwork-specs/tools/check-app-manifest-standard.mjs --root <project>`.
