---
description: "SDKWork mini-program account management plugin (browser half): the 小程序账号 row below 公众号账号 and the 90%-viewport modal over the IAM backend OAuth resource-account API — AppID/AppSecret entry, editing, enable/disable, deletion, and login checks."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts

English | [中文](README.zh.md)

## Summary

SDKWork mini-program account plugin (browser half): registers the **小程序账号** row in the settings-menu popover, directly below 公众号账号, and the 90%-viewport modal it opens at the root-scoped `settings.miniPrograms` seat. The modal owns the tenant's WeChat mini-program accounts — AppID and AppSecret entry, display-name/credential edits, enable/disable, deletion, and the backend login check — over the same IAM backend OAuth resource-account surface that the sdkwork-iam PC admin mini-program page manages.

## Table of Contents

- [How it works](#how-it-works)
- [Build](#build)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## How it works

- `src/client/index.ts` registers the `miniProgram` locale dictionaries, mounts the `MiniProgramHost` adapter, and contributes the modal to the `settings.miniPrograms` seat (single seat; the runtime grant lives in `ui-sdkwork-settings-menu`'s `mode.rail.settings` children table).
- `src/client/miniProgramHost.ts` builds one generated IAM **backend** client from the shared `ui-sdkwork-env` gateway origin and the `ui-sdkwork-iam` session, mirroring the session into the browser-global token manager before every read. A host revision counter moves on every environment or session transition, so the modal re-reads the client after an environment switch.
- `src/client/miniProgramApi.ts` mirrors the sdkwork-iam admin account flow: read the `mini_program` resource-account rows; create an account by reusing (or creating) its `wechat_mini_program` login integration, refusing a duplicate AppID; toggle the account and its integration together; delete only the account row; queue the backend mini-program login check; and rotate AppID/AppSecret while keeping a blank AppSecret unchanged.
- `src/client/MiniProgramsWorkspace.tsx` owns the ledger, the create form (AppID, AppSecret, display name, enabled), the edit form, status toggling, deletion behind an inline confirmation, and the login-check notice.
- `src/client/MiniProgramsModal.tsx` is the modal frame: it decides whether a gateway origin is configured, whether an IAM session exists, and which client the workspace calls. Dismissal paths are the header button, a mask click, and Escape. Creating or editing an account opens a left `Drawer` above the modal.
- Internationalization follows `sdkwork-specs` (`I18N_SPEC.md`): every user-visible string lives in `src/client/locales.ts` (zh is the key-set source of truth, en is checked complete), and dark/light adaptation uses only `--dsw-alias-*` tokens that flip with the host theme.

<a id="build"></a>
## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts bundle
```

<a id="dev-note"></a>
## Dev Note

The modal is browser-only; the host half of this package is an empty `apply`. It imports no other feature plugin: shared declarations come through `import type`, and the only runtime collaboration is the injected `env`/`iam` services plus the `settings.miniPrograms` slot grant. The generated backend client is bundled privately, so neither the web shell nor another plugin gains a new module-table identity.

The surface talks to the IAM **backend** OAuth API rather than the app API: sdkwork-iam exposes mini-program *login* to the app tier, while mini-program *account* management exists only as the admin resource-account surface. The backend routes enforce their own OAuth admin permissions; a signed-in user without them reaches the API and is refused there.

<a id="model-experience"></a>
## Model Experience

None, as the plugin renders browser-side mini-program account management chrome and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The ledger reads one bounded page of 200 resource accounts and filters `mini_program` rows locally; a tenant above that size needs cursor pagination, which is not exposed yet.
- The full developer configuration the admin page offers — custom/legal request domains, the WeChat domain ownership files, and the logo/upload field — is not exposed here yet. The form covers the account identity and credentials that make login work.
- The login check is queued asynchronously; this modal confirms the request was accepted and does not poll or render the resulting probe verdict.
- The capability needs the IAM OAuth admin permission on the signed-in account. The modal surfaces the server's refusal; it does not pre-check the local permission scope.
