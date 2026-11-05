# Agent Note: One login surface for every entry

Status: implemented

English | [中文](2026-11-04-unified-login-surface.zh.md)

## Problem

The product offered sign-in through two unrelated pieces of UI. The desktop welcome window (`apps/desktop`) carried the shipped design: BirdCoder mark and wordmark, `欢迎使用 BirdCoder`, the slogan, a filled `登录`, and an elevated `添加 API Key`, all in a fixed 600 × 700 band layout. The web GUI's account dialog (`ui-settings-account`) was a generic modal with an "开始使用" heading, a paragraph of instructions, and a right-aligned action row: it shared neither the brand header, the copy, nor the button geometry. Signing in from the sidebar therefore showed a different product than signing in at launch, and the two surfaces had to be maintained twice. The entry points also started the browser flow themselves (`AccountMenu`, `AccountSection`), so the dialog only ever appeared in its waiting state — the login page users recognize was never shown in the workspace.

## Decision

`ui-primitives` owns one presentation-only `LoginPanel`, and every login surface renders it. It is fork-owned next to `BirdLogo` and `BirdWordmark`, so an upstream merge cannot revert the unification.

- **One layout, two variants.** `variant="window"` reproduces the desktop welcome geometry exactly (40px brand band, `minmax(0, 1fr)` identity area, 104px action band, 24/48/76 padding); `variant="dialog"` stacks the same three bands with 36px spacing and a corner dismiss control for a modal card. Both variants render the brand mark, the welcome line with its emphasized product name, the slogan, and a 240px action column whose primary sits above the secondary.
- **Copy and actions are props.** The primitive owns no locale, matching every other atom. `welcome` carries `before`/`brand`/`after`/`description`; `actions` is an ordered descriptor list (`primary`, `secondary`, `text`) with `busy`/`busyLabel`, `disabled`, `hidden`, and a `form` for a host-owned submit. `children` renders a method page in place of the welcome block, and `welcomeHidden` keeps the block mounted for the desktop's page toggles.
- **The desktop welcome renders it on every page.** `WelcomePage` hands the entry, the API-key form, and the sign-in status in as `children`/`actions`, so the shared component now owns the brand row, welcome line, and action column that `renderer/welcome.css` used to own. Ids, hidden toggles, focus behavior, analytics calls, IPC operations, and the expected copy snapshots are unchanged.
- **The web account dialog renders it in every state.** The idle state is the welcome page: brand, welcome line, slogan, `登录`, `添加 API Key`. Waiting, timeout, and failure keep the same panel and replace the welcome block with a method-status block, so the dialog never loses its brand identity. `AccountMenu` and the Account settings sign-in button now open the surface (`showLogin(true)`) instead of starting the flow; the surface's own `登录` is the one action that starts it, exactly as in the welcome window.
- **The SDKWork IAM modal host renders it as its entry step.** `ui-sdkwork-iam`'s `SignInOverlay` — the surface behind the settings menu's `登录 / 注册` row, a gated mode page's sign-in button, and a model-selection sign-in demand — opens on `LoginPanel` (`variant="dialog"`) with `登录`, plus `添加 API Key` when the desktop shell exposes its key page. That entry's own `登录` runs the configured login gesture: the hosted browser hand-off by default, or the sdkwork account method form (password, phone code, email code, QR) in the same overlay when the deployment configures it ([decision](2026-11-04-configurable-login-gesture.md)). While the browser hand-off owns that gesture the entry also carries the quiet In-app sign-in action, which raises the account form directly ([decision](2026-11-05-in-app-login-link.md)). A caller whose own surface already showed the entry (the desktop welcome page, or its API-key page ending in `login`) runs the same configured gesture, so the entry never appears twice in a row.
- **Copy is the desktop's copy.** The added account and IAM keys carry the same welcome line and slogan as `apps/desktop/src/locale.ts`, and the product name comes from `readOemBrandName()`, so an OEM deployment renames every surface together. The retired `loginTitle`/`loginDescription` keys are gone.

## Alternatives considered

**Restyle the web dialog to match and leave the desktop markup alone.** Lost: "unified" would be a visual coincidence maintained in two files; the next change to either surface would separate them again, which is the failure mode the brand contract already fixes for logos.

**Put the component in a new `ui-sdkwork-login` package.** Lost: client plugin packages may not runtime-import another feature package's components, so `ui-settings-account` could not render it. `ui-primitives` is the documented home for components shared across plugins.

**Rename the dialog's accessible name to the old "开始使用" to keep external selectors.** Lost: the visible heading is the welcome line, so an accessible name that does not contain it fails label-in-name; the four in-repo e2e selectors and one ARIA golden are updated instead.

**Keep starting sign-in from the menu and show the welcome page while waiting.** Lost: the requested behaviour is the attached login component first; the browser would open before the user ever sees the product's login page.

**Point the settings-menu row at the web account dialog instead of the IAM overlay.** Lost: that dialog starts the DeepSeek account authorization flow, which the deployed tenant does not register as a relying party, while the desktop product account is the SDKWork IAM session. The row would open a login that cannot complete.

## Consequences

Every login entry — desktop launch, the settings menu's `登录 / 注册` row, gated mode pages, model selection, the sidebar account menu, Account settings, and the model-onboarding sign-in step — now shows the same BirdCoder login surface, and that surface's `登录` runs the configured login gesture (the hosted browser hand-off by default). A method page (the IAM account form, the API-key form, browser-waiting status, timeout, failure) is one step behind it and keeps its brand header. Opening the IAM overlay mid-session adds one click compared with the old direct modal; the desktop welcome handoff and a demand that already showed the welcome page skip that click. The web dialog is now taller than the old 380px card; it caps at 400px and the action column shrinks below 240px when the viewport is narrower. The desktop welcome window's geometry is unchanged; `renderer/welcome.css` no longer styles the brand row, welcome line, or action column.

## Testing

`packages/client/ui-primitives/tests/login-panel.client.spec.tsx` covers the identity block, action dispatch, a busy loader and its accessible name, the text action, the dialog dismiss control, a hidden welcome block, a `form` submit action, and method children replacing the welcome block. `apps/desktop/tests/welcome-renderer.client.spec.tsx` keeps all 31 welcome behaviours and its per-language copy snapshots, with the brand-row assertion now reading the row instead of a stylesheet class. `packages/client/ui-settings-account/tests/sign-in-dialog.client.spec.tsx` re-records every dialog state, and `account.client.spec.tsx` pins that both entries open the surface without starting a flow. `packages/client/ui-sdkwork-iam/tests/sign-in-overlay.client.spec.tsx` pins the entry step (Sign in, the desktop-only API-key choice, method tabs absent), the quiet in-app sign-in link that appears only while Sign in hands off to the browser, the login step, and the unconfigured notice; `iam-service*.client.spec.ts` pin which of `openEntry`/`openLogin` a gesture raises and the `usesBrowserHandoff()` predicate the link keys off. The web e2e dialog selectors and the `onboarding-deepseek-config` ARIA golden use the welcome heading as the dialog name.
