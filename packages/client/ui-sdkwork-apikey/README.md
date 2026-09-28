---
description: "SDKWork cloudrouter API key management plugin (browser half): the wide API-key management modal mounted at the root-scoped settings.apiKeys seat."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-apikey

English | [中文](README.zh.md)

## Summary


SDKWork cloudrouter API key management plugin (browser half): registers the wide **API Key 管理** modal into the settings-menu popover's feature row → the root-scoped `settings.apiKeys` seat. The key table's columns need more width than the settings panel provides, so this is an independent 80vw modal, not a `settings.section` page.

## Table of Contents

- [How it works](#how-it-works)
- [Build](#build)
- [Dev Note](#dev-note)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## How it works

- `src/client/index.ts` registers the `apikey` locale dictionaries, mounts the `ApiKeyHost` adapter, and contributes the modal to the `settings.apiKeys` seat (single seat; the runtime grant lives in `ui-sdkwork-settings-menu`'s `mode.rail.settings` children table).
- `src/client/apikeyHost.ts` builds the generated cloudrouter app/models clients from the shared `ui-sdkwork-env` + `ui-sdkwork-iam` services (global token manager) and binds them through the api-keys service's injectable seam (`configureApiKeyServiceClients`), re-binding on every environment/IAM transition.
- `src/client/ApiKeysModal.tsx` hosts the sibling console's `ApiKeysView` inside the wide modal. The view speaks react-i18next; the global i18next singleton is initialized at module load with the vendored console catalog (`consoleApiKeysMessages.ts`, en + zh) and follows the host locale (`zh → zh-CN`, `en → en-US`).
- Internationalization and dark/light adaptation follow `sdkwork-specs` (`I18N_SPEC.md`, `THEME_DARKMODE_SPEC.md`): the modal consumes `--dsw-alias-*` tokens that flip with the host theme, and the sibling console view's Tailwind utilities (including every `dark:` variant) are compiled by this package's own sheet (`src/client/apiKeysView.css`).
- That compilation is contained. Every fork bundle that styles with Tailwind injects its own `@layer utilities` copy from its own source roots, and inside one layer document order decides — so the bundle that loaded last owned the shared class names, which rendered the toolbar, the table and the drawer white on a dark host and wrapped the primary button's label, while the classes only this sheet defines (`bg-slate-50`, `sm:w-72`) stayed correct. The build wraps the compiled sheet in the `dsh-sdkwork-apikey-embed` cascade layer, declared last by `apps/web/src/index.css`, and scopes it to the embed root plus the overlays the view portals to `document.body`; `src/client/embedScope.ts` holds the attribute and selector names the component and the build share.

<a id="build"></a>
## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-apikey bundle
```

<a id="dev-note"></a>
## Dev Note

The modal is browser-only: the host half of the api-keys service lives in its own package, and this package consumes it exclusively through the generated cloudrouter clients plus the injectable `configureApiKeyServiceClients` seam, so the web bundle stays free of host-side credentials code.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The embed's cascade-layer position is a contract with the shell: `apps/web/src/index.css` must declare `dsh-sdkwork-apikey-embed` after `utilities` and after `dsh-sdkwork-embedded-app`. A shell that drops the statement leaves the position to bundle load order, which is the collision the containment exists to remove.
- The other nine fork bundles that compile their own Tailwind utilities still collide with each other under the same mechanism; `ui-sdkwork-token-plan` (unwrapped, class-based `dark` variant) is the clearest case. Containing them is this change applied package by package, and none of them is in scope here.
- The console view's own `@theme` custom properties sit on `:root`, outside both scope roots, so they are inert inside the embed; the Tailwind theme and the `primary-*` / `lobster-*` ramps come from the shell sheet.
