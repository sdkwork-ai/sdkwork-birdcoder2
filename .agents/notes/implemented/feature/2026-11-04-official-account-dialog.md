# Agent Note: User-owned official-account configuration

Status: implemented

English | [中文](2026-11-04-official-account-dialog.zh.md)

## Problem

The settings popover could open the relay API-key dialog, but the official-account (公众号) capability had no entry in the client. The only IAM implementation was `@sdkwork/iam-pc-admin-oauth`: a backend-admin surface over tenant login resource accounts, mounted by the IAM admin workspace and authenticated with a backend-admin session. That is the wrong tier for "each user maintains their own official account": the login resource is a tenant-wide integration with an OAuth client and secret cascade, and an end user's session cannot reach the backend API at all.

## Decision

**A user-owned app-api resource.** The IAM app API gains `iam.oauth.officialAccounts` — list/create/retrieve/update/delete at `/app/v3/api/iam/oauth/official_accounts` — backed by a new `iam_user_official_account` table scoped by `(tenant_id, user_id)`. The rows are the caller's own channel configuration (AppID, display name, account type, original id, logo, message-push endpoint, custom-menu draft); they never participate in login, so no integration, OAuth client, or tenant operator is involved. AppSecret, message-push token, and EncodingAESKey are stored only as encoded signing-secret references and are never returned; every handler resolves the caller from the verified request context and scopes by the session's tenant and user.

**A new app-tier PC module.** `@sdkwork/iam-pc-oauth` (`sdkwork.architecture: pc-react`, `surface: app`, capability `oauth`) owns the surface: `SdkworkIamOfficialAccountsPanel` (list, create/edit, enable/disable, delete, custom-menu draft editor), a page wrapper, `createSdkworkIamOfficialAccountsClient` over `client.iam.oauth.officialAccounts`, a commit-point controller, and the zh-CN/en-US catalog. The IAM PC host registry lists the package and the client-surface model/parity ledger carry the `app.iam.oauth.official-accounts` screen.

**BirdCoder mounts that module.** `@deepseek-ai/dsh-client-ui-sdkwork-official-accounts` registers the settings row above the relay API-key row and a dialog at `settings.officialAccounts`. Its host adapter builds only the generated IAM app client (dual-token, `pc`) from the shared gateway origin, mirrors the session into the browser-global token manager, adapts the `iam.oauth.officialAccounts` slice, and hands the controller to the panel. The dialog decides gateway readiness, session presence, host locale, and color scheme; `SdkworkThemeProvider` and `SdkworkI18nProvider` supply the SDKWork tokens and copy. The panel's Tailwind sheet is compiled from the app-tier module and `@sdkwork/ui-pc-react` sources and contained in the `dsh-sdkwork-official-accounts-embed` layer plus dialog/body-portal scopes.

## Alternatives considered

**Reuse `@sdkwork/iam-pc-admin-oauth`.** Rejected: it is the backend-admin login-resource surface. Its rows are tenant integrations used for authentication, its client requires the backend API, and an end-user session has neither the credential nor the business permission. Letting end users edit login resources would also let them change tenant authentication.

**A console-tier module.** Rejected: the console surface is the tenant-operator tier over the backend API, not an end user's own channel. "Each user manages their own" is the app tier by the surface vocabulary.

**Reimplement the form inside the fork.** Rejected: the capability's data contract, validation, secret handling, and future publishing belong to sdkwork-iam; a fork copy would diverge from the app SDK surface within a release.

## Consequences

The app API now carries a user-scoped resource with its own table, migration, contract entries, and secret references; the backend-admin resource-account surface is untouched. The custom-menu editor saves a draft only: pushing it to WeChat and publishing articles need a provider call path that the app API does not expose yet, so the parity cell stays `partial` and the module is not mounted on an IAM PC app route. The BirdCoder plugin inlines the app-tier module and `@sdkwork/ui-pc-react` into a ~1.6 MB bundle, and its compiled sheet keeps the same shell layer-position contract as the other embeds.

## Verification

`iam-database-contract-alignment` passes over the new table; `db:migrate` applied `0024_iam_user_official_account` to the local Postgres and `db:drift:check` passes. `cargo test -p sdkwork-routes-iam-app-api --lib` covers payload normalization, blank-secret preservation, secret sealing/decoding, and menu validation (24 tests); `cargo test -p sdkwork-routes-iam-app-api --test iam_http_standard` passes the manifest surface and Postgres-backed router tests (28 tests), and `api:assembly:validate` passes. `tools/check-iam-client-parity.mjs` passes with the new screen. `@sdkwork/iam-pc-oauth` typechecks and its 12 tests pass (adapter, controller, panel). The BirdCoder package typechecks, its 57 client tests pass, and the live web app was driven over CDP: the menu renders the row in place, the dialog opens, its embed root reports `ready`, the body portal mark is set, and no console error is emitted.
