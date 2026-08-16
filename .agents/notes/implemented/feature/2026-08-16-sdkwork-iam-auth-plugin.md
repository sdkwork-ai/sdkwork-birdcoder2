# Agent Note: SDKWork IAM auth integration (ui-iam plugin)

Status: implemented

English | [中文](2026-08-16-sdkwork-iam-auth-plugin.zh.md)

## Problem

The harness (web + desktop) had no account concept: `ui-settings-menu`'s account seam rendered an anonymous profile with a disabled sign-out row, and no login/registration surface existed. The product asked to integrate sdkwork-iam — sign-in, registration, and sign-out — as a plugin following the harness plugin specification, reusing the sdkwork-iam PC auth components (page + modal), and landing it in both the web and the desktop compositions.

## Decision

A new client plugin `packages/client/ui-iam` (`@deepseek-ai/dsh-client-ui-iam`) composes the sdkwork-iam auth stack behind the harness's existing extension points, plus four small seam evolutions in shared packages:

- **Account seam evolution (`ui-settings-menu`).** `AccountRuntime` gains a swappable `AccountSource` (`setSource`) with a `signIn` gesture and a `signInAvailable` profile flag; the hover menu renders the 登录 / 注册 row while a signed-out source advertises one. The seam keeps its anonymous default, so deployments without the plugin see no change.
- **Account app mode (`ui-layout` + `ui-app-modes`).** `AppModeId` gains `account`; `ILayout.setMode` exposes the frame's mode switch to services; the rail's `MODE_ORDER` includes `account`. The full-page auth lives in the account mode page.
- **Settings namespace exposure (`host/apiproxy`).** The api-proxy's settings describe RPC exposes a fixed product namespace allowlist; `ui-iam` and the shared `ui-env` environment section join it, otherwise the browser scopes stay `loading` and the plugins are inert. This was the second boot-blocker found by e2e after the bundle itself loaded.
- **The plugin** provides `ctx.iam` (sdkwork auth controller over the generated `@sdkwork/iam-app-sdk` client + the `ui-iam` settings mirror + presentation dispatch), binds the menu seam, registers the account mode (rail entry + page), and hosts the modal on `shell.overlay`. The IAM base URL and tenant app id come from the shared `ui-env` environment profile (a new client package `packages/client/ui-env`); each environment's `apiBaseUrl` defaults to the api.sdkwork.com origin, so the integration is live out of the box, and an explicit empty `apiBaseUrl` keeps the rail entry, session restore, and the auth surfaces off — but the menu's 登录 / 注册 row stays advertised, opening the modal into the configuration notice rather than a silent no-op. The `ui-iam` settings namespace keeps only the presentation and QR/OAuth toggles.
- **Bundle wiring.** `web-app` and `desktop-app` patch rows mount the plugin; both apps depend on it. `apps/web` gains the Tailwind v4 pipeline (the sdkwork auth components are Tailwind-styled; `@source` into the sdkwork packages, `primary-*` aliased to the deepseek brand ramp). The sdkwork surfaces are themed through the auth stack's own appearance system: the harness theme snapshot (`ctx.theme`, live via `theme/change`) picks the light `sdkwork` or dark `midnight` preset, and `client/auth-appearance.ts` overlays the harness semantic tokens (`--dsw-alias-*` references resolved at runtime) onto the panel, fields, labels, tabs, and oauth cards, so the surfaces repaint with the application in both color schemes. The brand color and the primary-button text ride the same projection through `--sdk-color-brand-primary` and `--sdkwork-auth-primary-button-text-color` in the web sheet. The sheet also rebinds the Tailwind `dark:` variant to `body[data-ds-dark-theme]` (`@custom-variant dark`) and flips `color-scheme` on `.sdkwork-auth-surface`, so the secondary `dark:` utilities and the native form controls follow the harness appearance preference instead of the OS media query. The ui-iam notice surfaces (configuration notice panel) consume the harness overlay token (`--dsw-alias-bg-layer-2`), replacing two tokens the theme sheets never defined.

### Workspace and typecheck architecture

The sdkwork packages are joined as sibling pnpm workspace members (the sdkwork ecosystem convention, `../sdkwork-*` beside this repo) with a catalog pinning react to the 18 line (an override tames the sibling's react 19 devDeps, which otherwise poison `@testing-library/react` peer resolution). The sdkwork source cannot compile under the harness's strictest flags or emit portably into `lib/types`, so:

- `tsconfig.json` (the emit project) resolves `@sdkwork/*` to local declaration facades (`sdkwork-types/`) and emits with `noCheck`; the facades cover only the consumed surface.
- `tsconfig.tests.json` (the full check, wired into `typecheck:contracts-ready`) compiles the plugin against the REAL sdkwork sources with the sdkwork flag set (strict only) and one React type identity (paths map `react`/`react-dom`/`react/jsx-runtime` to `@types/react` 19). It is the drift guard for the facades.
- The tsdown client bundle swaps in a path-free tsconfig (inlines the real packages), pins `qrcode` to its browser entry (its node renderers drag `fs`/`stream` into the browser bundle and the module-table loader rejects them), and empties the one plain sdkwork stylesheet (appbase's AppErrorPage css; that page never mounts).

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Depend on published sdkwork npm packages | The auth-pc-react chain is unpublished; only the app-sdk and sdk-common are on npm |
| Typecheck the sdkwork closure under the harness strict flags | Their code is written for strict-only; exactOptionalPropertyTypes/noUnusedLocals/override violations are theirs to keep |
| Whole-program tsc with the sdkwork source | rootDir declaration emit is impossible (TS2883 on their menubar); hence the facade + tests-project split |
| Hand-write a fake auth UI | The product asked to reuse the sdkwork-iam PC components |

## Consequences

- Sign-in/register (full page via the account mode, modal via the settings menu), sign-out, and session restore work on web and desktop with a configured `ui-env` apiBaseUrl — by default the api.sdkwork.com origin, so no settings document is needed to start. With an explicit empty apiBaseUrl the settings menu still advertises 登录 / 注册 while signed out, and the gesture opens the modal (or the account mode page for the page presentation) into the shared configuration notice — the feature is discoverable before configuration, never silently missing.
- The e2e (`apps/web/tests/ui-iam.e2e.ts`) boots the real composition against a stub IAM server and asserts the unconfigured menu-to-notice flow, the default-baseUrl rail entry and modal auth surface (the default origin is route-intercepted with the stub's responses), the configured rail entry, the full-page auth, and the modal host; it dismisses the first-run onboarding dialogs (welcome notice + credential step) that appear a few seconds after boot.
- Verification-code login methods are hidden (the harness app client lacks the messaging verification-code API); registration/recovery work code-less when the backend policy permits.
- Portability: the sibling workspace entries require the `../sdkwork-*` checkouts beside this repo (the sdkwork ecosystem layout); a standalone checkout without them cannot install.
