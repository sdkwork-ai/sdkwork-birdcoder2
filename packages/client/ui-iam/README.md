# @deepseek-ai/dsh-client-ui-iam

English | [中文](README.zh.md)

SDKWork IAM integration plugin: sign-in/register (full page + modal) and sign-out through the sdkwork-iam auth stack, mounted as the account app mode, the settings-menu account seam, and a frame overlay modal host.

## Surface

The plugin contributes three surfaces plus one service seam:

- **The account mode** (`mode.page` keyed `account`). The mode page mounts the sdkwork full-page auth surface (`SdkworkAuthPage`, password login + email/phone registration + recovery, per the `ui-iam` settings toggles) while signed out; once authenticated it shows the account summary (display name, username, user id, email) with a sign-out button. Unconfigured, the page fails loud with the configuration notice. The mode is reached from the settings-menu sign-in gesture, not from the mode rail.
- **The modal sign-in host** (`shell.overlay` entry `iam-sign-in`): the settings-menu account seam's sign-in gesture opens `SdkworkSessionAuthLoginModal` when the `presentation` setting is `modal`; without a configured base URL it opens into the configuration notice instead of the auth surface.
- **The settings-menu account seam**: the plugin replaces the menu's anonymous account source through `ctx.account.setSource` — signed out it advertises the sign-in row (登录 / 注册) with no configuration required, signed in it publishes the display identity and enables the footer sign-out.
- **`ctx.iam`**: the IAM service face — the sdkwork auth controller over the generated `@sdkwork/iam-app-sdk` client, the `ui-iam` settings mirror, and the sign-in presentation dispatch (modal vs page).

## Configuration

The IAM base URL and tenant application id come from the shared [ui-env](packages/client/ui-env/README.md) profile — the active environment's `apiBaseUrl` is the IAM app-api origin and `appId` is the tenant application id; an empty `apiBaseUrl` keeps session restore and the auth surfaces off (the menu's 登录 / 注册 row stays advertised and opens into the configuration notice). The `ui-iam` settings namespace (host-side registration in this package's node half, exposed to the browser through the api-proxy's product namespace list) carries only the presentation and login toggles:

| Field | Default | Meaning |
|---|---|---|
| `presentation` | `modal` | How the settings-menu sign-in opens: the modal or the full-page account mode |
| `qrLoginEnabled` | `false` | Offer QR-code login on the auth surfaces |
| `oauthLoginEnabled` | `false` | Offer OAuth provider login on the auth surfaces |

The session is persisted in `localStorage` under `dsh.iam.session` and restored at boot once the environment reports a configured base URL. Verification-code login methods are hidden by default (the harness's app client does not speak the messaging verification-code API); registration and recovery proceed without a code while the backend policy permits, and the auth page honors the backend's fetched policy when it requires one.

## Model Experience

None. Sign-in state is browser-side identity; nothing here reaches a model request.

## Implementation notes

- The runtime adapter (`iam-runtime.ts`) maps the `SdkworkIamRuntimeAuthRuntimeLike` surface onto the generated app client (dual-token auth mode) and keeps the client's credential state in step with the localStorage token store.
- The auth surfaces are the sdkwork components; their Tailwind utilities come from `apps/web`'s Tailwind pipeline (`@source` into the sdkwork packages, `primary-*` aliased to the harness's deepseek brand ramp).
- The package's tsc emit resolves `@sdkwork/*` to local declaration facades (`sdkwork-types/`) — the sdkwork source cannot be emitted portably into `lib/types`; the full typecheck against the real packages runs in `tsconfig.tests.json` (wired into `typecheck:contracts-ready`), which is the drift guard for the facades. The tsdown client bundle swaps in a path-free tsconfig so the bundle inlines the real packages, pins qrcode to its browser entry (its node renderers would drag `fs` into the browser bundle), and empties the one plain sdkwork stylesheet (an error-page css for a component this harness never mounts).

## Known Limitations and Deferred Work

- **Verification-code login** — email/phone code login and verification-required registration need the messaging verification-code API; the harness app client does not expose it, so those methods are hidden or surface the backend policy's requirement.
- **QR and OAuth login** — off by default; enabling them needs the backend features and the QR/OAuth provider catalog.
- **Single personal session** — organization/login-context selection challenges surface the sdkwork dialogs, but the harness has no tenant administration; multi-tenant flows are untested.
