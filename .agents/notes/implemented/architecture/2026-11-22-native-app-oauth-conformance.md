# Agent Note: The native-app OAuth surface rejects forged loopback callbacks and offers a manual sign-in path

Status: implemented

English | [中文](2026-11-22-native-app-oauth-conformance.zh.md)

## Problem

The desktop browser login is an OAuth 2.0 native application: the system browser opens the hosted authorization page, and the authorization code returns either through the registered custom scheme (`birdcoder://auth/callback`) or, where the deployment enables it, through an RFC 8252 loopback redirect (`http://127.0.0.1:<ephemeral-port>/auth/callback`). Four gaps kept that surface short of the standard and of a complete login:

1. The loopback listener accepted any `GET` that carried a `code`/`error` parameter. RFC 8252 section 7.3 treats this listener as reachable by every local caller, so a web page could drive callbacks (PKCE and state still decided the result) and use the listener as an oracle.
2. A deep-link callback delivered while the window's renderer was going away threw from `webContents.send`. The exception skipped the cross-process sharing that follows the delivery and lost the URL for the process that owns the flow; a throwing preload subscriber could starve every other subscriber of the same event.
3. The hand-off card only offered "Open browser again". When the system browser reported success but showed no window (another desktop, a browser that swallowed the request), the waiting flow had no manual path even though the app held the exact authorize URL.
4. `startPendingSignIn` consumed the welcome page's one-shot sign-in request before the in-app surface existed. The browser gesture can run without that surface, but the in-app account form cannot: a composition whose overlay failed to render lost the login instead of presenting it later.

## Decision

The native surface now rejects requests it cannot legitimately receive, tolerates a failing delivery, and keeps a manual path for the waiting attempt.

- **Loopback request provenance.** Only a top-level document navigation passes: a request with an `Origin` header, a non-`navigate` `Sec-Fetch-Mode`, or a non-`document` `Sec-Fetch-Dest` is answered `404` and never forwarded. The `Host` check against the bound `127.0.0.1:<port>` stays, both responses carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and the success page keeps its `Content-Security-Policy: default-src 'none'` with no scripts, external references, or secrets.
- **Delivery cannot drop the callback.** The main-process bridge guards `webContents.send`, so a destroyed window no longer skips peer sharing, and the URL stays in the shell's take for the renderer's recovery poll ([callback recovery](../bug-fix/2026-11-22-deeplink-callback-recovery.md)). The preload isolates each subscriber, so the login runtime and page diagnostics both observe the hand-off even if one throws.
- **Manual sign-in path.** The runtime captures the authorize URL at the shell-open call — the one place it exists — and exposes it while the attempt waits. The hand-off card offers it as a copy action; it disappears as soon as the attempt settles, because a spent or expired `state` must not be reopened.
- **The in-app gesture waits for its surface.** `startPendingSignIn` starts the browser gesture without the modal host, and leaves the request for the mounting host when the configured gesture is the in-app form. `attachModal` raises the waiting or failure card for whichever attempt is live.
- **A changed login identity abandons the pending attempt.** When the app-api origin, hosted origin, client id, or callback changes, `ensureDesktopLogin` cancels the previous runtime before replacing it, so the durable PKCE flow of the old authorization server is cleared instead of staying redeemable against the new one.
- **A loopback attempt survives a renderer reload within its listener bound.** The shell exposes the waiting redirect (`loopbackLogin.pending`) and keeps one callback accepted while no page could hear it (`loopbackLogin.takeCallback`, taken destructively). The reloaded page adopts that carrier, takes the retained URL once, and redeems it against the persisted flow, so a reload no longer costs a loopback login before the listener's five-minute bound.
- **The welcome gesture waits for its settings section.** The hand-off runs at apply time while the IAM settings scope still reports `loading`; the request waits up to two seconds for the section, because choosing from the defaults could start the browser hand-off for a deployment configured for the in-app form. A settings document that never arrives falls back to the shipped gesture instead of holding the login.
- **The brand's reverse-domain identity is a callback scheme.** The shell reports `desktop.appId` as `DSH_BRAND_APP_ID`, the packager declares both the product scheme and that application id in the operating-system protocol registration, and the OEM profile may name `com.sdkwork.birdcoder://auth/callback` — or the authority-less `com.sdkwork.birdcoder:/auth/callback` RFC 8252 section 7.1 illustrates — as `sdkwork.iamRedirectUri`. The OAuth client id stays named after the brand protocol; the application-id form is the one RFC 8252 sections 7.1 and 8.4 recommend for a private-use redirect.
- **The attempt's carriers are released when it settles.** Expiry, a rejected exchange, or a stale callback that stops the flow closes the loopback listener, stops the take, and drops the authorize URL; a stale link that leaves the flow waiting keeps all three.

## Standards conformance

The client-observable requirements of the native-app OAuth best current practice, and where each is enforced and pinned:

| Requirement | Enforcement | Regression |
| --- | --- | --- |
| Only an external user-agent performs the authorization (RFC 8252 sections 5, 6, 8.12) | `openExternal` hands the authorize URL to the shell bridge, which opens the system browser; no window loads the hosted page | `iam-deeplink-login-e2e` asserts the URL reaches `shellOpen` and the hand-off card waits |
| Public native clients implement PKCE with S256 (sections 6, 8.1; RFC 7636) | The runtime generates a 43-character base64url verifier and an S256 challenge per attempt | `iam-deeplink-login-e2e` asserts `code_challenge_method=S256`, the challenge, and the verifier in the redeem |
| Redirect URI matching is exact on scheme, authority, and path (sections 7.1, 8.4, 8.10) | `matchesIamRedirectUri`; lookalike schemes, foreign paths, and the product link are refused | `iam-deeplink-links.spec.ts` matcher and bridge cases |
| Loopback redirects use the IP literal, an ephemeral port, the exact path, and a `Host` check (sections 7.3, 8.3) | `iam-loopback-redirect.ts` binds `127.0.0.1:0` and validates both | `iam-loopback-redirect.spec.ts` |
| The loopback port opens for one attempt and closes with it (section 8.3) | `begin` starts it; commit, cancel, expiry, and a failed open close it | `iam-loopback-redirect.spec.ts`, `iam-desktop.client.spec.ts` |
| Only the browser navigation reaches the listener (section 7.3) | `isBrowserNavigation` rejects `Origin` and non-navigation Fetch Metadata; `no-store`, `nosniff`, and `default-src 'none'` | `iam-loopback-redirect.spec.ts` |
| High-entropy `state`, and any response without the pending value is refused (section 8.9) | The runtime keeps 24 random bytes per flow; the controller compares in constant time and keeps the flow on a mismatch | `iam-deeplink-login-e2e` stale-callback cases |
| The redirect used in the request is stored with the flow and the response must arrive on it (section 8.10) | The flow stores `redirectUri`; the runtime parses against its descriptor, and a changed identity abandons the attempt instead of crossing authorization servers | `iam-service-browser-login.client.spec.ts` identity-change case |
| A public client presents no shared secret (sections 8.5, 8.9) | The redeem body carries code, client id, verifier, redirect, device id only, with `skipAuth` | `iam-desktop-redeem.client.spec.ts` |
| The authorization code is single-use (sections 8.1, 8.12; RFC 6749 section 4.1.2) | The redeem is at-most-once per code, with transport retries disabled | `iam-desktop-redeem.client.spec.ts` |
| Tokens never appear in URLs or logs (RFC 9700 section 4.2) | The callback carries the code only; failures log codes and messages, never tokens | `iam-deeplink-login-e2e` failure cases |

The brand owns two private-use schemes: the short product scheme and the reverse-domain application id (`desktop.appId`). RFC 8252 sections 7.1 and 8.4 recommend the latter, so the shell reports it as `DSH_BRAND_APP_ID`, the packaged application declares both schemes in its protocol registration, and the OEM profile may name either as `sdkwork.iamRedirectUri`; the shipped default stays the short scheme until the tenant registers the application-id callback. The brand's application id may present either private-use form RFC 8252 section 7.1 defines — `com.sdkwork.birdcoder://auth/callback`, and the authority-less `com.sdkwork.birdcoder:/auth/callback` — while the short product scheme keeps the authority-bearing form. Two further points remain deployment decisions and are recorded as known limitations: one callback is registered for every tier instead of one per authorization server (section 8.10), and the loopback listener binds IPv4 only (section 7.3 recommends attempting both; the deployment registers the IPv4 redirect). RFC 8252 appendix B.3 recommends `SO_EXCLUSIVEADDRUSE` on Windows; Node/Electron exposes no portable socket option for it, and the state check remains the gate on a bound port.

## Alternatives considered

**Keep the permissive loopback listener and rely on state validation alone.** PKCE and state do decide the outcome, but the listener would still answer web-page requests with a success page and forward forged codes into the runtime, which is noise a native app does not have to accept.

**Reject every request without Fetch Metadata headers.** Older browsers and machine callers send none; the listener would stop working for them while the state check already protects the flow. Only headers that positively identify a non-navigation request are refused.

**Send the authorize URL to the renderer when the login starts, instead of capturing it at the shell call.** The URL is built by the auth runtime from the PKCE pair it generated; the host-open call is the earliest place this module observes it without duplicating that construction.

**Render an in-app surrogate when the in-app overlay never mounts.** A second presentation of the account form would duplicate the auth stack's surface; the request waiting for the real mount is the smaller decision.

## Consequences

A local web page can no longer drive the loopback callback or read the listener's result page, and a window closing mid-delivery no longer costs the login. A user whose browser silently failed to open can copy the authorize URL and finish in any browser, and a welcome request whose surface has not rendered yet still starts the browser login. The cost is one clipboard action on the waiting card, a stricter loopback contract that browsers satisfy by navigating, and a request that waits (rather than being dropped) when the configured gesture is the in-app form.

## Verification

`apps/desktop/tests/iam-loopback-redirect.spec.ts` proves the forged-request rejection (Origin, `no-cors`, non-document destination), that a navigation still passes, the `nosniff` header, and the waiting carrier with its one-shot retained callback. `apps/desktop/tests/iam-deep-links.spec.ts` proves a throwing window still shares the callback and keeps it for the renderer's take, and that a throwing subscriber does not starve the others. `packages/client/ui-sdkwork-iam/tests/iam-desktop.client.spec.ts` proves the authorize URL is exposed only while waiting, released on settle, and that a reloaded page adopts the waiting loopback carrier and redeems its retained callback. `packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` proves the browser gesture starts without the host, the in-app gesture waits for it, a loading settings section decides the gesture before the request is consumed, a section that never arrives falls back to the shipped gesture, and a changed identity abandons the pending attempt. `packages/client/ui-sdkwork-iam/tests/sign-in-overlay.client.spec.tsx` proves the copy action appears only for a waiting attempt and copies the exact URL.
