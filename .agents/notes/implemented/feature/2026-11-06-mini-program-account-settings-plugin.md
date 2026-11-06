# Agent Note: Mini-program account management over the IAM backend OAuth surface

Status: implemented

English | [中文](2026-11-06-mini-program-account-settings-plugin.zh.md)

## Problem

公众号账号 had a user-facing management row, but the other WeChat provider asset — the mini-program account that backs mini-program login — had no place in BirdCoder. sdkwork-iam exposes mini-program *login* to app clients (`oauth.miniProgramSessions`) but mini-program *account* management only on its PC admin surface: `iam_oauth_resource_account` rows with `resourceAccountKind = "mini_program"`, created together with a `wechat_mini_program` login integration, plus a backend login check. The new surface had to sit directly below 公众号账号, reuse that account model rather than invent one, and remain an independent plugin.

## Decision

`ui-sdkwork-mini-program-accounts` is a third independent settings-menu plugin. It owns the `settings.miniPrograms` row (directly below 公众号账号), an 80vw dialog, its locale namespace, and its own host adapter. The adapter builds the generated **IAM backend** client (`@sdkwork/iam-backend-sdk`) from the shared `ui-sdkwork-env` gateway origin and the `ui-sdkwork-iam` session, using the browser-global token manager and a revision counter so an environment switch rebuilds the client.

The capability is the IAM backend OAuth resource-account surface, and the plugin mirrors the admin page's flow rather than re-deriving it: list `mini_program` rows from one bounded page; on create, reuse or create the `wechat_mini_program` integration (same code, provider fields, `surfaceKind`, enabled state), refuse a duplicate AppID, and create the resource account with `accessMode: "operator_managed"`; toggle the account and its integration together; delete only the account row; queue `miniProgramLoginChecks`; and rotate AppID/AppSecret while a blank AppSecret keeps the stored credential. The backend enforces the OAuth admin permission on every call, so the dialog renders its refusal rather than pre-checking the local scope.

## Alternatives considered

**Embed the sdkwork-iam admin mini-program page.** `SdkworkIamOauthMiniProgramAccountsPage` is the visual reference, but it is a private `pc-admin` package that drags in the admin shell, Tailwind, the Drive upload field, and the full admin controller dependency set (`iam-pc-admin-core`, `iam-service`, backend SDK). Mounting it in an 80vw settings dialog would couple BirdCoder to the backend-admin console layout for one account form.

**Use the IAM app API.** The app SDK exposes only `oauth.miniProgramSessions` (login); it has no mini-program account resource. Inventing an app-tier account endpoint would require a backend change outside this repository.

**Move the flow into the Host.** A Host service would re-implement the same backend calls and add a second contract over the IAM authority; the environment/IAM services already supply the transport seam.

## Consequences

- `packages/client/ui-settings` declares `settings.miniPrograms`; `ui-sdkwork-settings-menu` owns the grant, the row between 公众号账号 and 域名管理, and the dialog mounting. The plugin keeps 100% source coverage in its own suite, and `apps/web/tests/settings-menu.e2e.ts` asserts the row and the dialog open in the real web composition.
- The surface reads at most 200 resource accounts per open and filters locally. Cursor pagination, the admin page's domain/verification-file configuration, logo upload, and polling the login-check verdict stay deferred and are recorded in the package README.
- The dialog is behind the IAM backend OAuth admin permission. A signed-in BirdCoder user without it sees the server refusal; signed-in visual verification against a real gateway with that permission has not been recorded.
