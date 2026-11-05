# Agent Note: The in-app login link on the product login entry

Status: implemented

English | [中文](2026-11-05-in-app-login-link.zh.md)

## Problem

[Configurable login gesture](2026-11-04-configurable-login-gesture.md) made the hosted OAuth page the shipped login gesture behind the product login entry's Sign in. That gesture needs the tenant application's OAuth relying-party registration, and it completes in the system browser where the app can observe nothing: an unregistered tenant answers `invalid_client` in a page the workspace never sees, and the hand-off card simply waits. The documented opt-out is `signInMethod: modal`, which is a Host setting — the person at the login surface cannot change it, and the entry offers no other path. So a user whose browser login cannot complete (misapplied registration, a blocked browser, a lost deep link) has no way into the in-app account methods from the surface that already asked them to sign in.

## Decision

- The entry keeps a quiet **In-app sign-in** action (简体中文：内置弹窗登录) under its action column while the browser hand-off owns Sign in. It raises the same `SdkworkSessionAuthLoginModal` the `modal` setting raises, through `IamService.openSignInMethods()`, so the pre-hand-off login mode stays reachable without a settings change.
- The link is conditional on the exact fact that selects the gesture. `IamService.usesBrowserHandoff()` is `signInMethod === 'browser'` plus the desktop deep-link bridge; `startSignIn()` dispatches through that method, and the overlay reads it through the `browserHandoff` inject hook, so one predicate owns both the gesture and the link's visibility. Where Sign in already raises the in-app form — `modal` configured, or a page without the deep-link bridge — the link is omitted rather than repeating the button.
- The link is an ordinary `LoginAction` of kind `text`, so it reuses the shared `LoginPanel` quiet-action treatment: no new component, no new copy styling. Its CSS now lets that action follow the last button (it flows inside the action column instead of being anchored below the fixed action band). A full two-button column lands on the same pixels as before, which is the desktop welcome window's API-key page; a one-button column keeps the link one 16px rhythm step under its button instead of stranding it at the card's footer.

## Alternatives considered

**Change `signInMethod` to `modal`.** Lost: the gesture is a deployment decision and the right one for a registered tenant, while the failure in front of the user is local and immediate. Asking them to edit Host settings to get back into the app is not a recovery path.

**Show the link unconditionally.** Lost: on a plain browser page or with `modal` configured, Sign in already raises the account form, so the second entry would duplicate the first with no added capability.

**Put the fallback on the browser hand-off card.** Lost: the card is on screen only while the hosted page is being opened. The failure the user meets happens after that — the hosted page answers an error, or the browser is blocked before a page loads at all — and reopening the card needs the entry anyway. The entry is where the choice is made, so the alternate path belongs beside the gesture that chose the browser.

**Render the link as a second `secondary` button.** Lost: two equal-weight buttons would ask the user to choose between two login mechanisms, which is the product's decision to make; a quiet action states the in-app form as the fallback it is.

## Consequences

A user whose deployment's hosted login cannot complete still signs in inside the app, and the browser gesture stays the primary path for every tenant that registered the client. The entry grows one line only in the browser-hand-off state, so the plain-browser web product and `modal` deployments render exactly what they did before. The cost is a second login mechanism on one surface: a deployment can no longer claim the in-app form is unreachable under `browser`, and support copy can now point at a real control.

## Testing

`sign-in-overlay.client.spec.tsx` pins the link under `browserHandoff`, its absence otherwise, the gesture it calls, and that Sign in keeps running the configured gesture. `iam-service-browser-login.client.spec.ts` covers `usesBrowserHandoff()` across the shipped default, `modal`, and no-bridge states, and that `openSignInMethods()` raises the account form directly. `ui-primitives`' `LoginPanel` spec covers the quiet action, and the desktop welcome window's key-page rendering was compared before and after the CSS change and is pixel-identical. The entry was inspected in both themes at 600x700 and in a constrained 460px viewport; the long-label case relies on the unchanged `nowrap` treatment.
