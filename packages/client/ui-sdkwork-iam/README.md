---
description: "SDKWork IAM integration plugin: sign-in/register and sign-out through the sdkwork-iam auth stack, mounted as the account app mode, the settings-menu account seam, and a frame overlay modal host."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-iam

English | [中文](README.zh.md)

## Summary


SDKWork IAM integration plugin: sign-in/register (full page + modal) and sign-out through the sdkwork-iam auth stack, mounted as the account app mode, the settings-menu account seam, and a frame overlay modal host.

## Table of Contents

- [Surface](#surface)
- [Configuration](#configuration)
- [Implementation notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Surface

The plugin contributes three surfaces plus one service seam:

- **The account mode** (`mode.page` keyed `account`). The mode page mounts the sdkwork full-page auth surface (`SdkworkAuthPage`: password, phone-code, and email-code login, QR, plus email/phone registration and recovery, per the `ui-sdkwork-iam` settings toggles) while signed out; once authenticated it shows the account summary (display name, username, user id, email) with a sign-out button. Unconfigured, the page fails loud with the configuration notice. The mode is reached from the settings-menu sign-in gesture, not from the mode rail.
- **The modal sign-in host** (`shell.overlay` entry `iam-sign-in`): the settings-menu account seam's sign-in gesture opens the product login entry when the `presentation` setting is `modal` — the shared `LoginPanel` (brand mark and wordmark, welcome line, slogan, Sign in, Add API Key) that the desktop welcome window and the web account dialog render. The entry's Sign in runs the configured login gesture (`signInMethod`): the shipped `browser` opens the hosted authorization page in the system browser and shows a hand-off card that waits for the deep link and offers a retry; `modal` raises `SdkworkSessionAuthLoginModal`, the account method form (password, phone code, email code, QR), without leaving the app. A page without the desktop deep-link bridge always uses the in-app form. A caller whose own surface already showed the entry — the desktop welcome page, or its API-key page ending in `login` — runs the same configured gesture, so the entry never appears twice in a row. Add API Key opens the shell's sign-in page, whose key form writes the credential; a plain browser page owns no such page, and the entry omits that choice unless the deployment sets `brand.showApiKeyEntry: true` in the OEM profile. Without a configured base URL the modal opens into the configuration notice instead. A sign-in surface opens only from an explicit gesture — this menu row, or the sign-in button on a gated mode page's signed-out notice (`AuthenticatedModeShell`). No mode switch, submission, or page mount raises it: a gated page states its requirement in place.
- **The desktop sign-in page**: `requestSignIn()` — the demand behind `ctx.iam`'s deferred requirement — opens the shell's welcome page over a running workspace when the `dshDesktop.auth.openSignIn` bridge exists, instead of going straight to the modal. `'login'` then runs the configured login gesture described above (the in-app form by default), `'credential'` means the user stored an API key instead, and `'dismissed'` answers "no"; the page never holds tokens, and the workspace document is not reloaded. A plain browser page opens the in-app form directly.
- **The settings-menu account seam**: the plugin replaces the menu's anonymous account source through `ctx.account.setSource` — signed out it advertises the sign-in row (登录 / 注册) with no configuration required, signed in it publishes the display identity and enables the footer sign-out.
- **`ctx.iam`**: the IAM service face — the sdkwork auth controller over the generated `@sdkwork/iam-app-sdk` client, the `ui-sdkwork-iam` settings mirror, the sign-in presentation dispatch (modal vs page), the account-profile reads and writes (`retrievePersona`, `updatePersona`), and the selectable catalog (`retrievePersonaCatalog`) that the persona picker consumes over the same client, base URL, and token manager.

## Configuration

The IAM base URL and tenant application id come from the shared [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile — the active environment's `apiBaseUrl` is the IAM app-api origin and `appId` is the tenant application id; an empty `apiBaseUrl` keeps session restore and the auth surfaces off (the menu's 登录 / 注册 row stays advertised and opens into the configuration notice). A custom `sdkwork.iamBaseUrl` in the OEM profile replaces that origin in every tier; the generated client still appends the same `/app/v3/api/auth/...` paths with the same parameters and the `X-Platform: pc` header, so only the domain changes.

The in-app sdkwork auth surface is the account method form behind the product login entry. It carries the account methods the IAM tenant serves — password, phone code, email code, and QR (the `qrLoginEnabled` setting, on by default) — and commits each successful login through the shared token store, which mirrors the dual-token session into `<DSH_HOME>/iam/session.json` through the `sdkworkDesktop.iamSession` bridge. A later launch restores that session, so an already signed-in user skips the login surface and the action that demanded it simply continues.

The hosted OAuth browser login is the shipped login gesture on desktop, and it requires the tenant application's OAuth relying-party registration: `runtimeConfig.oauth.relyingParty` with `clientId: birdcoder`, `redirectUris: ["birdcoder://auth/callback"]`, `confidential: false`, and the `openid profile email offline_access` scopes. `agent.app.config.json` declares exactly that, and the tenant applies it through the PC admin relying-party surface or the app manifest. A tenant without the registration answers `<iamAuthorizeBaseUrl>/iam/v3/oauth/authorize` with `invalid_client`, and because that page lives outside the app nothing in the workspace can detect or repair it — such a deployment sets `signInMethod: modal` until the registration lands. Once registered, a start-up failure is the only failure the card can see, and it offers a retry. The bridge is the standard `sdkworkDesktop` preload shape (`deepLinks` / `shellOpen`), and the pending PKCE flow lives in page memory, so a callback that launches a fresh process has no pending flow and is consumed once and ignored rather than reported as a failure.

The `ui-sdkwork-iam` settings namespace (host-side registration in this package's node half, exposed to the browser through the api-proxy's product namespace list) carries only the presentation and login toggles:

| Field | Default | Meaning |
|---|---|---|
| `presentation` | `modal` | How the settings-menu sign-in opens: the modal or the full-page account mode |
| `signInMethod` | `browser` | What the login panel's Sign in button starts: the hosted page in the system browser, or the in-app form (`modal`) for a tenant without the relying-party registration |
| `qrLoginEnabled` | `true` | Offer QR-code login on the auth surfaces |
| `oauthLoginEnabled` | `false` | Offer OAuth provider login on the auth surfaces |

The session is persisted in `localStorage` under `dsh.iam.session` and restored at boot once the environment reports a configured base URL. In the desktop shell the same complete session is mirrored through the `sdkworkDesktop.iamSession` bridge into `<DSH_HOME>/iam/session.json` (auth token, access token, rotating refresh token, session id, user, and AppContext), written atomically with owner-only permissions; a boot whose browser-local copy is missing restores from that file, and a commit whose durable write fails is rejected instead of claiming a login that would not survive the next launch. Verification-code login methods are hidden by default (the harness's app client does not speak the messaging verification-code API); registration and recovery proceed without a code while the backend policy permits, and the auth page honors the backend's fetched policy when it requires one.

## Implementation notes

- The runtime adapter (`iam-runtime.ts`) maps the `SdkworkIamRuntimeAuthRuntimeLike` surface onto the generated app client (dual-token auth mode) and keeps the client's credential state in step with the localStorage token store.
- `@deepseek-ai/dsh-client-ui-sdkwork-iam/src/sdkwork-global-token-manager.ts` owns the browser-global `AuthTokenManager` shared by every SDKWork-backed client plugin. IAM login writes merged IAM and env credentials into that manager; Drive, Knowledge, Token Plan, Feedback, and Agents surfaces read the same transport instead of creating isolated managers.
- The auth surfaces are the sdkwork components; their Tailwind utilities come from `apps/web`'s Tailwind pipeline (`@source` into the sdkwork packages, `primary-*` aliased to the harness's deepseek brand ramp). Light form fields overlay `--dsw-alias-bg-overlay` and `--dsw-alias-border-l2` rather than the collapsed light `bg-layer-*` whites; dark fields use `bg-layer-1` against the elevated shell. The QR column uses the same shell fill; the frame around the white canvas is transparent. Overlay CSS ships as a CSS Module (`sdkwork-auth.module.css`) so the client bundle injects it.
- The package's tsc emit resolves `@sdkwork/*` to local declaration facades (`sdkwork-types/`) — the sdkwork source cannot be emitted portably into `lib/types`; the full typecheck against the real packages runs in `tsconfig.tests.json` (wired into `typecheck:contracts-ready`), which is the drift guard for the facades. The tsdown client bundle swaps in a path-free tsconfig so it inlines the private auth and i18n source packages, pins qrcode to its browser entry (its node renderers would drag `fs` into the browser bundle), and empties the one plain sdkwork stylesheet (an error-page css for a component this harness never mounts). The published package declares only the public `@sdkwork/iam-app-sdk@0.1.1` optional dependency; npm consumers never resolve the private source packages.

## Model Experience

None, as the package is a browser-side SDKWork sign-in and account surface and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Verification-code login** — email/phone code login and verification-required registration need the messaging verification-code API; the harness app client does not expose it, so those methods are hidden or surface the backend policy's requirement.
- **QR and OAuth login** — off by default; enabling them needs the backend features and the QR/OAuth provider catalog.
- **Browser login needs the tenant's relying-party registration** — `signInMethod: browser` opens the tenant's hosted authorization page, which answers `invalid_client` until the tenant applies the `oauth.relyingParty` block from `agent.app.config.json` (`clientId: birdcoder`, `redirectUris: ["birdcoder://auth/callback"]`); the browser shows that error document and the app cannot observe it, so a tenant that has not applied the block sets `signInMethod: modal`.
- **Single personal session** — organization/login-context selection challenges surface the sdkwork dialogs, but the harness has no tenant administration; multi-tenant flows are untested.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`sdkwork-global-token-manager.ts` owns the browser-global `AuthTokenManager` shared by every SDKWork-backed client plugin — IAM login writes merged IAM and env credentials there, and Drive, Knowledge, Token Plan, Feedback, and Agents surfaces read the same transport instead of creating isolated managers. The tsc emit resolves `@sdkwork/*` to local declaration facades; the `tsconfig.tests.json` typecheck against the real packages is the drift guard.

</details>

## Runtime invariants

No runtime invariant companion is published; the account seam swap is a service call (`ctx.account.setSource`) whose contract the settings menu consumes unchanged, the IAM session facts flow through the sdkwork controller own state machine, and the auth surfaces mount through the standard keyed slots; session/presentation agreement is covered directly by this package client behavior specs.
