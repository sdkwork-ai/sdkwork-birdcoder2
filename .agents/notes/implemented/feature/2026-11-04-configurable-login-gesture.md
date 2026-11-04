# Agent Note: Configurable login gesture with the browser hand-off as the default

Status: implemented

English | [中文](2026-11-04-configurable-login-gesture.zh.md)

## Problem

The product login entry had exactly one behavior behind its Sign in button: raise the in-app sdkwork account method form. The hosted OAuth browser login already existed end to end — `beginBrowserSignIn()` opens the tenant's authorization page through the desktop shell's `shellOpen`, and the `birdcoder://auth/callback` deep link redeems the code through the generated IAM client — but no surface offered it. The product's own login experience is the hosted page: it carries the tenant's password, phone-code, email-code, QR, registration, and recovery flows, runs in the user's browser with the password manager and existing sessions, and is the surface every desktop app in this family uses. Keeping it unreachable left the desktop with a different login than the web product.

One deployment requirement decides whether that page can load: the tenant application must carry its OAuth relying-party registration. Without it the authorize endpoint answers `invalid_client` with a Problem+json document, rendered in the browser; the app cannot see that page, so it has no way to detect, explain, or repair it from the workspace.

## Decision

- **One setting, one gesture.** `ui-sdkwork-iam` gains `signInMethod: 'browser' | 'modal'`, default `browser`, next to the existing `presentation` toggle. It is a live volatile field, so the browser half resolves it from the same settings section as the QR and OAuth toggles.
- **One dispatcher for every login entry.** `IamService.startSignIn()` runs the configured gesture: with `browser` and the desktop deep-link bridge present it shows the new `browser` overlay step and calls `beginBrowserSignIn()`; `modal` raises the in-app method form. The login panel's Sign in button, both desktop welcome hand-offs (the in-workspace `'login'` outcome and the launch one-shot), and the API-key page's login ending all call this dispatcher, so no entry keeps the old unconditional path. A page without the desktop deep-link bridge always uses the in-app form.
- **The hand-off card owns the wait.** The `browser` step states that the hosted page is open and retries the flow. A failed start renders the failure copy with the same retry instead of claiming the page opened. Closing the card cancels the waiting attempt, and a redeemed session dismisses it, so a late deep link cannot reopen the surface.
- **The relying party is a deployment prerequisite, declared in the manifest.** `agent.app.config.json` already carries `oauth.relyingParty` (`clientId: birdcoder`, `redirectUris: ["birdcoder://auth/callback"]`, public, `openid profile email offline_access`). The tenant applies it through the PC admin relying-party surface or the app manifest. A tenant that has not applied it sets `signInMethod: modal`, which is the documented opt-out; the app cannot fall back on its own because the unregistered-client error happens in the browser.

## Alternatives considered

**Default to the in-app form.** Lost: the hosted page is the product's login (registration, recovery, QR, and the browser's own session/password store), and the deployment requirement is a registration step, not a product limitation. Hiding the product's login to accommodate an unapplied tenant configuration would also leave the browser gesture reachable only through an undocumented setting.

**Detect `invalid_client` and fall back to the form silently.** Lost: the browser page is outside the app, so there is nothing to detect; a silent fallback would also hide a deployment misconfiguration.

**Keep the in-app form and add a second "browser login" button.** Lost: the login gesture is a product decision, and two buttons on the entry would ask the user to choose what the product already chose.

**Offer a "use popup login" switch on the hand-off card.** Lost: the login gesture is a deployment decision, and a card-level switch contradicts the configured value while adding a second entry path that no scenario needs.

## Consequences

Clicking Sign in leaves the app on desktop: the browser opens the tenant's hosted login page, the workspace shows the hand-off card, and the deep-link completion signs in and dismisses the card. The gesture depends on the tenant's relying-party registration; until it is applied the browser shows the authorize endpoint's `invalid_client` document, so such a deployment configures `modal` — the in-app method form, one setting away. Sign-in demands held for a backend call stay pending across the browser round trip and are released by the session commit.

## Testing

`packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` covers the shipped browser dispatch, the configured `modal` dispatch, the no-bridge fallback, the failure flag and retry, the dismiss-cancels-waiting path, and the card closing on a redeemed session. `iam-deeplink-login-e2e.client.spec.ts` drives a demand through the desktop welcome page into the hosted page and completes it through a real deep link, using the real `@sdkwork/iam-desktop-auth` controller. `sign-in-overlay.client.spec.tsx` pins the hand-off card's copy and its single retry action in both waiting and failed states. `host.client.spec.ts` pins the new field as live and defaulted to `browser`.
