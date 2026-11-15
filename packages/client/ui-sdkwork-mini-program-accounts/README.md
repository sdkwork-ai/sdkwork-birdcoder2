---
description: "SDKWork mini-program account management plugin (browser half): the 小程序账号 row below 公众号账号 and the 90%-viewport modal mounting the shared @sdkwork/iam-pc-mini-program operator panel over the IAM backend OAuth resource-account surface."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts

English | [中文](README.zh.md)

## Summary

SDKWork mini-program account plugin (browser half): registers the **小程序账号** row in the settings-menu popover, directly below 公众号账号, and the 90%-viewport modal it opens at the root-scoped `settings.miniPrograms` seat. The modal mounts the shared `@sdkwork/iam-pc-mini-program` operator panel — the one mini-program account implementation the sdkwork-iam PC admin page and every product host consume — after binding this host's gateway origin and IAM session to the generated backend client.

## Table of Contents

- [How it works](#how-it-works)
- [Build](#build)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## How it works

- `src/client/index.ts` registers the `miniProgram` frame dictionaries, mounts the `MiniProgramHost` adapter, contributes the modal to the `settings.miniPrograms` seat (single seat; the runtime grant lives in `ui-sdkwork-settings-menu`'s `mode.rail.settings` children table), and imports the compiled panel stylesheet.
- `src/client/miniProgramHost.ts` builds one generated IAM **backend** client from the shared `ui-sdkwork-env` gateway origin and the `ui-sdkwork-iam` session, mirroring the session into the browser-global token manager before every read. It then builds the shared controller with `createMiniProgramController(createMiniProgramOperatorTransport(createMiniProgramBackendOperations(client.iamOauth.iam.oauth)))`. A revision counter moves on every environment or session transition, so the modal re-reads the controller after an environment switch.
- `src/client/miniProgramApi.ts` owns only that generated-client construction; the account model, the one-click integration → account setup, the mutations, and the copy live in `@sdkwork/iam-pc-mini-program`.
- `src/client/MiniProgramsWorkspace.tsx` mounts the shared panel under `SdkworkThemeProvider` and `SdkworkI18nProvider` (the panel's own catalog), mapping the harness locale id (`zh`/`en`) onto the catalog tag.
- `src/client/MiniProgramsModal.tsx` is the modal frame: it decides whether a gateway origin is configured, whether an IAM session exists, and which shared controller the workspace renders. Dismissal paths are the header button, a mask click, and Escape. The panel owns the account list, its create/edit drawer, the delete confirmation, and the login check; those overlays portal to `document.body`, so the modal sets the body portal marker for its open lifetime and the plugin's scoped stylesheet lifts them above the harness layer.
- The panel styles itself with Tailwind utilities from the IAM checkout. `src/client/miniProgramView.css` and `tsdown.config.ts` compile those utilities into the plugin bundle inside `@layer dsh-sdkwork-mini-program-embed` and `@scope (data-mini-program-embed)` (duplicated for the body-portaled overlays), so the shared class names neither leak into the harness nor lose to another bundle's copy. `src/client/embedScope.ts` is the single place both sides read the scope names from.
- Internationalization is split by ownership: this namespace (`src/client/locales.ts`) carries the settings-row frame copy (title, description, notices, sign-in gate), while every account/panel string lives in `@sdkwork/iam-pc-mini-program`'s catalog and is never duplicated here.

<a id="build"></a>
## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-mini-program-accounts bundle
```

<a id="dev-note"></a>
## Dev Note

The modal is browser-only; the host half of this package is an empty `apply`. It imports no other feature plugin: shared declarations come through `import type`, and the only runtime collaboration is the injected `env`/`iam` services, the theme service, and the `settings.miniPrograms` slot grant. The shared panel and the generated backend client are bundled privately, so neither the web shell nor another plugin gains a new module-table identity.

The surface talks to the IAM **backend** OAuth API rather than the app API: sdkwork-iam exposes mini-program *login* to the app tier, while mini-program *account* management exists only as the admin resource-account surface. The backend routes enforce their own OAuth admin permissions; a signed-in user without them reaches the API and is refused there, and the shared panel renders that refusal instead of hiding it.

Because the panel is an SDKWork application surface, this package is also the fork's Tailwind boundary: its build compiles the shared sources into one contained sheet, and `apps/web/src/index.css` declares the embed's cascade layer last so load order cannot change the rendered result.

<a id="model-experience"></a>
## Model Experience

None, as the plugin renders browser-side mini-program account management chrome and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The shared panel mounts with the operator capability set. It includes the login check and the enable/delete actions; a future self-service posture would need the app-tier transport instead of the backend one.
- The backend resource-account list has no channel filter, so the panel reads one bounded 200-row page and paginates `mini_program` rows client-side; a tenant above that size needs cursor pagination, which is not exposed yet.
- The surface `mini_program_environment` / `release_channel` fields are not part of the resource-account projection, so the panel shows them only when a host row carries them and never edits them here.
- The login check is queued asynchronously; the panel reports the accepted request (or the endpoint's returned status message) and does not poll a later probe verdict.
- The capability needs the IAM OAuth admin permission on the signed-in account. The panel surfaces the server's refusal; it does not pre-check the local permission scope.
