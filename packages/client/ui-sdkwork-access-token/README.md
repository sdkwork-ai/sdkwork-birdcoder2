---
description: "SDKWork access-token initializer plugin: adds an 初始化 Access Token action to sdkwork-* project rows and a dialog that writes the public application access token (tenant-level or organization-level) into every selected application root's profile matrix, for Vite, Flutter, mini program, Harmony native, and other JSON runtime roots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-access-token

English | [中文](README.zh.md)

## Summary

Every manifest-bearing SDKWork application root carries one public application access token per profile (`APP_ACCESS_TOKEN_SPEC.md` §2). This plugin initializes that matrix from the workspace row: right-click a project directory whose name starts with `sdkwork-` and choose **初始化 Access Token**. The dialog discovers the application roots (the project root itself or its `apps/*` children), reads each `agent.app.config.json`, lets the operator pick the token level, application type, runtime target, and environments, previews the claims, and writes the deterministic token into each format's committed profile file.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

The plugin mounts as the web-app `ui-sdkwork-access-token` row. Once active it contributes:

- the **初始化 Access Token** row in the workspace project menu (through `ui-sdkwork-workspace-row-menus`), shown only when the clicked project directory's name starts with `sdkwork-`;
- the same verb in the shared workspace context menu, for compositions without the row-menus plugin;
- a `shell.overlay` dialog that reads and writes the project through the `uiWorkspace` directory bridge.

The dialog's choices:

| Choice | Effect |
| --- | --- |
| Public isolation token | Generated offline from the manifest identity, written into the profile matrix (§2), for pre-login tenant/organization isolation |
| Signed access token | Generated after an SDKWork account login through the §8 exchange, only for applications the signed-in user created, about one hour and revocable, never committed |
| Tenant-level | `organization_id=0`, `login_scope=TENANT`, `ownership_scope=TENANT` |
| Organization-level | a non-zero organization id, `login_scope=ORGANIZATION`, `ownership_scope=ORGANIZATION` |
| Application type | the profile-file carrier: Vite `.env.<profile>`, Flutter `env/sdkwork.<profile>.json`, mini program `config/mini-program/runtime-env.<profile>.json`, Harmony native and other JSON runtime roots `config/app/runtime-env.<profile>.json` |
| Runtime target | the surface target the token claims (`browser`, `flutter-android`, `mini-program`, `harmony-native`, `android-native`, …) |
| Environments | any subset of the ten-profile matrix; the default is all ten |

Existing profile content is preserved: a dotenv file keeps every other key and its own line endings, a JSON runtime document keeps its other members, and a file that already carries the identical token is reported unchanged instead of being rewritten.

### Remembered login (DSH home)

The signed-token mode signs in with the mounted IAM session when one exists. Otherwise it reads the login the Host settings section remembers for this project and falls back to the form. The durable authority is the plugin's standard settings section (`ui-sdkwork-access-token`, `accounts`), persisted by the Host settings service under the harness home; the Host half also projects it to the operator-readable file `<DSH_HOME>/sdkwork/access-token.config.json` (`$DSH_HOME`, then `~/.dsh`), written atomically with mode `0600`. Nothing is written inside an application repository.

```json
{
  "schemaVersion": "1.0.0",
  "kind": "sdkwork.access-token-config",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "accounts": [
    {
      "project": "D:\\sdkwork-space\\sdkwork-im",
      "username": "admin",
      "password": "…",
      "baseUrl": "https://api-dev.sdkwork.com",
      "bootstrapAccessToken": "<public application token>",
      "environment": "development",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

One row per project directory (Windows paths compare case-insensitively and accept either separator). `baseUrl`/`bootstrapAccessToken` fall back to the shared ui-sdkwork-env profile when empty; `environment` preselects the exchange lifecycle. The browser reads and writes the section through `ctx.configForms`, never the file. The password lives in component state for the login call and is cleared once a session exists; no token, password, or header ever reaches the console.

**Admin/operator accounts are remembered automatically.** When the signed-in account is an administrator/operator account (`admin`, `operator`, or a name continuing them with a digit or `. _ + -`, including the local part of an e-mail), a successful login upserts that project's row in the settings section; the Host then rewrites the projection. Repeating the same facts reports "already current" and writes nothing. Ordinary accounts are never persisted.

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/index.ts` — the Host half: the durable `ui-sdkwork-access-token` settings section (remembered admin/operator logins) and the atomic `<DSH_HOME>/sdkwork/access-token.config.json` projection, rewritten at startup and after every accepted commit of the namespace.
- `src/access-token-settings.ts` — the platform-free contract both faces share: namespace, projection constants, account row, project identity key, lookup/upsert, projection document, and the page-global path decode.
- `src/client/index.ts` — registers the dictionaries, provides the `accessTokenInitializer` service the row menu dispatches into, mounts the dialog on `shell.overlay`, and registers the shared workspace context-menu contribution. Its `inject` is `['slots', 'locale', 'configForms']`; `uiWorkspace`, `env`, `iam`, and `contextMenus` are read optionally, so the plugin loads in a minimal composition.
- `src/client/accessToken.ts` — the public token contract of `APP_ACCESS_TOKEN_SPEC.md` §3: the fixed header (`alg: none`, `kid: public-app-token`), the required claims, tenant/organization scope derivation, the deterministic generation instants, and a decoder that fails closed on contradictory claims. The bytes match `tools/app-access-token.mjs` for the same inputs (a golden fixture pins this).
- `src/client/applicationTypes.ts` — the profile-file table of §2 plus the manifest/framework/marker inference behind the dialog's application-type default.
- `src/client/project.ts` — discovers manifest-bearing roots under the project directory and reads each one's identity (`backend.appId`, `backend.tenantId`, `backend.organizationId`, `backend.accessTokenPermissionScope`) from `agent.app.config.json`.
- `src/client/initializer.ts` — validates the whole public-token request before writing, then merges the token per format, creating the nested profile directories the format needs. Identity problems abort before any file is touched; a single unreadable profile file fails only that file.
- `src/client/signedToken.ts` — the signed-flow rules: privileged-account detection, own-application filtering, JWT decoding that refuses `alg:none`, and the fail-closed credential validation (anchor, release scope, owner, tenant, lifetime, expiry, lifecycle).
- `src/client/credentials-contract.ts` — the plain read/save/path face the dialog receives over the Host settings section.
- `src/client/sdkworkIamPort.ts` — the shipped transport over `@sdkwork/iam-app-sdk` (password grant and exchange) and `@sdkwork/deployments-app-sdk` (application list), with a per-call token manager.
- `src/client/SignedTokenPanel.tsx` — the login, own-application list, exchange, and credential presentation.
- `src/client/AccessTokenDialog.tsx` — the mode switch, the public-token form, the claims preview, and the per-file result list.

### Generation logic

The two modes answer two different credential questions, and the dialog never mixes them.

**Public isolation token (written to the profile matrix).** For every selected root and profile: `app_id = aud = manifest backend.appId (or the entered deployment anchor)`, `tenant_id = manifest backend.tenantId (or the entered override)`, `organization_id = 0` for tenant-level or the entered non-zero organization id for organization-level, `login_scope`/`ownership_scope` derived from that organization binding, `environment`/`deployment_profile` from the profile id, `runtime_target` from the selected application type, `permission_scope` from the manifest's bootstrap scope, `user_id=0`, fixed `iat`/`exp`, and the literal `public` signature segment. The JWT is deterministic, so re-running an unchanged initialization produces no diff; an existing dotenv/JSON document is merged, never replaced wholesale.

**Signed access token (issued after login).** Login resolves in this order: the mounted IAM session (its access/auth token pair), the DSH-home settings section's remembered login for this project (`accounts[project]`), then the typed form. The password grant runs against the gateway with the public bootstrap token as the credential-entry `Access-Token`. An `admin`/`operator` login is then upserted into the settings section (idempotent; ordinary accounts are not), and the Host rewrites the `<DSH_HOME>/sdkwork/access-token.config.json` projection. The session's IAM user id is the ownership key; the deploy application list is filtered to applications that user created (`createdBy`) or solely owns (`ownershipScope=USER` with `ownerUserId`). The selected application's `deployApplicationId` is exchanged at `POST /app/v3/api/iam/app_access_tokens` together with the chosen lifecycle; the response's access/auth token pair is decoded and validated: signature algorithm is not `none`, `app_id`/`aud` equal the anchor, the release scope matches the installation, a USER release names the session user, `tenant_id` matches the session, the lifetime stays inside the one-hour class, and `expiresAt` has not elapsed. Only then is the credential shown, with copy actions; it is never written to a committed file.

The public-mode token is an isolation credential, not a session credential: it carries no user identity (`user_id=0` for both supported levels), no `data_scope`, and no `permission_scope` beyond the root manifest's bootstrap scope (default `iam:self`). The signed mode is the opposite: a real user-session credential, issued by IAM to the signed-in account and bounded by its entitlement.

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. Its Host half owns the standard settings section and the DSH-home projection; its browser half is a dynamic plugin whose file access crosses the governed `uiWorkspace` directory bridge (1 MiB per text write, parent directories must exist), and the signed flow uses the generated SDKWork clients over the mounted IAM session or a password login.

## Runtime invariants

The spec suite verifies that disposing the plugin fiber removes the service, the overlay entry, and the context-menu contribution (HMR safety), that the token builder reproduces the canonical generator byte for byte, that a repeated initialization writes nothing, that the Host projection follows `$DSH_HOME` and is rewritten atomically after a commit, that the browser reads and writes the remembered login through the settings form, and that the real SDK transport sends the login, application-list, and exchange calls with the documented routes, headers, and bodies. The emit projects resolve the SDK packages through local declaration facades; `tsconfig.tests.json` (run with `pnpm typecheck:tests`) compiles the real SDK source as the drift guard.

## Model Experience

None, as this package writes committed client profile files from a workspace gesture; it adds no prompt, tool result, or session event.

#### KV Cache effect

None; no provider request is assembled or mutated.

## Known Limitations and Deferred Work

- Admin/operator auto-save is name-based (`admin`/`operator` plus a digit or separator, e-mail local part included) because the session carries no role claim; a deployment that names its privileged accounts differently can add the row to the settings section by hand (or write the projection file).
- The remembered password is stored in plain text inside the harness home (settings document plus the `0600` projection file) because the password grant needs it verbatim; it never enters a repository, and the dialog clears it from component state after the session exists.
- The signed flow offers only applications the signed-in user created or solely owns, and re-checks that fact before the exchange; the platform independently enforces the release-scope entitlement. An account that has created no application sees the empty explanation.
- The signed credential is a session-class credential (about one hour, revocable). It is displayed for immediate use and intentionally never written into the committed profile matrix; the public isolation token remains the committed carrier.
- The dialog only initializes manifest-bearing roots. A project without an `agent.app.config.json` at its root or under `apps/*` gets the empty-state explanation instead of a synthesized identity, because the token claims come from that manifest.
- The repository-level formatter `tools/materialize-client-env.mjs` remains the canonical full-materialization owner (URLs, bindings, cloud projection). This initializer writes only `SDKWORK_ACCESS_TOKEN` (plus the Harmony template's profile identity keys), so a repository whose materialization declaration pins a deployment anchor keeps that declaration as the source of the anchor for its own materializer runs; enter the anchor in the dialog when the token must match it.
- The token is generated with the fixed generation instants; rotation is an explicit code change plus a full regeneration, matching the spec.
- Only tenant-level and organization-level tokens are offered. `ownership_scope=USER` (a personal installation) is not a selectable level in this dialog.
- The directory bridge imposes the Host's text-file bound (1 MiB) and creates parent directories one level at a time; a profile file larger than the bound fails that file with the Host's message.
