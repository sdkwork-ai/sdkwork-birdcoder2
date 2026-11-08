---
description: "SDKWork IAM official-account (公众号) management plugin (browser half): the settings-menu row and the 90%-viewport modal hosting the user-facing IAM official-account panel at the root-scoped settings.officialAccounts seat."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-official-accounts

English | [中文](README.zh.md)

## Summary

SDKWork IAM official-account (公众号) management plugin (browser half): registers the **Official Accounts** row in the settings-menu popover, directly above the relay API-key row, and the 90%-viewport modal it opens at the root-scoped `settings.officialAccounts` seat. The modal hosts the user-facing capability module `@sdkwork/iam-pc-oauth`, which maintains the signed-in account's own official-account configuration over the IAM app API — no backend-admin surface and no tenant login resource.

## Table of Contents

- [How it works](#how-it-works)
- [Build](#build)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## How it works

- `src/client/index.ts` registers the `officialAccounts` locale dictionaries, mounts the host adapter, and contributes the modal to the `settings.officialAccounts` seat (single seat; the runtime grant lives in `ui-sdkwork-settings-menu`'s `mode.rail.settings` children table).
- `src/client/officialAccountsHost.ts` builds the generated IAM **app** client (`@sdkwork/iam-app-sdk`, dual-token, `pc`) from the shared `ui-sdkwork-env` gateway origin, mirrors the `ui-sdkwork-iam` session into the browser-global token manager before every read, adapts `client.iam.oauth.officialAccounts` through `createSdkworkIamOfficialAccountsClient`, and hands the resulting controller to the panel; an environment switch rebuilds the client and controller in place.
- `src/client/OfficialAccountsModal.tsx` is the modal frame: it decides gateway readiness, session presence, host locale, and host color scheme, then renders `SdkworkIamOfficialAccountsPanel` from `@sdkwork/iam-pc-oauth`. Account create/edit, enable/disable, message-push configuration, delete, and the custom-menu draft editor are that module's own controller calls. Its create/edit drawer is presented from the left above this modal.
- `SdkworkThemeProvider` supplies the SDKWork design tokens and the `.dark` class the panel's `dark:` variants bind to, and `SdkworkI18nProvider` scopes the module's zh-CN/en-US catalog to the host locale, because the modal lives in the harness (a CSS-module application with its own theme contract) rather than in an SDKWork application shell.
- The panel's Tailwind utilities are compiled by this package's own sheet (`src/client/officialAccountsView.css`) over the IAM app-tier module and `@sdkwork/ui-pc-react` source roots; the sheet imports the Tailwind sub-sheets only and writes a scoped reset for the panel root, so it never restyles the harness. The compiled sheet is contained in the `dsh-sdkwork-official-accounts-embed` cascade layer, declared by `apps/web/src/index.css`, and scoped to the embed root plus the overlays the panel portals to `document.body`; `src/client/embedScope.ts` holds the attribute and selector names the component and the build share.

<a id="build"></a>
## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-official-accounts bundle
```

<a id="dev-note"></a>
## Dev Note

The modal is browser-only and speaks two seams: the IAM app client built here, and the controller/panel port from `@sdkwork/iam-pc-oauth` (a workspace member joined for dependency resolution; the bundle inlines it through the `tsconfig.base.json` source alias). The app-tier rows are scoped by the session's tenant and user and never participate in login — the backend-admin `iam.oauth.resourceAccounts.*` capability in `@sdkwork/iam-pc-admin-oauth` is a different surface and is not used here.

## Model Experience

None, as the official-account modal is browser-side SDKWork configuration UI and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- The embed's cascade-layer position is a contract with the shell: `apps/web/src/index.css` must declare `dsh-sdkwork-official-accounts-embed` after `utilities`, `dsh-sdkwork-embedded-app`, and `dsh-sdkwork-appstore-embed`. A shell that drops the statement leaves the position to bundle load order, which is the collision the containment exists to remove.
- The custom-menu editor saves the draft only. Pushing it to WeChat (and publishing articles) needs the provider call path and is deferred; the app API currently exposes list/create/retrieve/update/delete only.
- The account logo is an external URL field: the panel does not mount a Drive image-upload service, so in-app upload is not offered.
- The modal requires a signed-in IAM session; the sign-in action raises the shared sign-in surface over the modal, and the panel mounts after the session appears.
