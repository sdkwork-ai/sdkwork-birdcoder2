# Agent Note: A dropped deep-link event still settles the desktop browser login

Status: implemented

English | [中文](2026-11-22-deeplink-callback-recovery.zh.md)

## Problem

The desktop browser login returns through `birdcoder://auth/callback`. The shell hands the callback to the renderer as a `sdkwork:deepLinks:open` event on the preload bridge, and an event carries no backlog: when the URL arrives while the renderer that owns the pending PKCE flow has no listener — a reloading document, the moment before the plugin bootstraps, or a runtime the plugin has not rebuilt yet — the delivery is dropped. The shell keeps the accepted URL for its `deepLinks.getInitialUrl` take and pushes it into the renderer's pending state, but nothing asks again, so the attempt waits until its four-and-a-half-minute deadline and then reports an expiry.

A production attempt showed the whole chain: the IAM installation had no deploy-application anchor, so the hosted authorization page answered with `error=server_error`, the shell accepted that callback and shared it through the relay spool, and the workspace still showed the waiting card while `sdkwork.iam.desktopAuthFlow.v1` kept the pending flow. A second, independent gap sat behind the same hand-off: `startPendingSignIn` refused to start the configured gesture until the modal host had mounted, so a composition whose overlay entry never rendered left the welcome login's one-shot request inert — no hosted page, no card, no failure, no login.

## Decision

A waiting browser login takes the shell's last accepted callback itself, and the login gesture no longer depends on the in-app surface.

- **The waiting flow asks for a missed callback.** Every two seconds while the attempt is waiting, `createIamDesktopLogin` reads `bridge.deepLinks.getInitialUrl()` and dispatches whatever the shell is holding through the same controller path the event uses. The take happens only while waiting: it is destructive, so an idle runtime must never consume a URL a newer attempt needs. A settled attempt stops taking; `cancel()` and `dispose()` release the timer, and a stale URL (`no-pending-flow` or `state-mismatch`) keeps the attempt waiting for the real one.
- **The welcome hand-off starts the gesture without the modal host.** The hosted page is the login surface; the in-app card only reports it. `startPendingSignIn` now consumes the one-shot request and runs the configured gesture even when `attachModal` has not run, and `attachModal` raises the waiting or failed card at that mount, so a late host catches up with the attempt already in flight instead of blocking it.

## Alternatives considered

**Queue accepted callbacks in the main process and re-send on renderer load.** It needs a new preload/IPC surface, and it still cannot reach a running renderer that has no listener when the callback arrives.

**Keep the modal gate and rely on the event.** The card is the only presentation of a login that may never start; waiting for it is what made the welcome login inert when the overlay did not render.

**Poll only after a visible retry gesture.** The user would still sit on a waiting card for the whole deadline before learning that the browser login already finished or failed.

## Consequences

A callback whose event was lost now settles the attempt within the poll interval: the hand-off card reports the hosted page's failure (for example the `server_error` a deployment without a relying-party anchor receives) instead of expiring, or commits the session the browser already produced. The welcome login runs even when the overlay entry never renders, and the card appears when that entry does mount. Cost: one IPC take every two seconds for the flow window, and a late-mounting overlay presents the card after the browser page rather than before it.

## Verification

`packages/client/ui-sdkwork-iam/tests/iam-desktop.client.spec.ts` proves the take recovers a callback whose event never fired, that a stale take keeps waiting, and that cancel stops the timer. `packages/client/ui-sdkwork-iam/tests/iam-deeplink-login-e2e.client.spec.ts` drives the real runtime and token store through a login whose event never reaches the page. `packages/client/ui-sdkwork-iam/tests/iam-service-browser-login.client.spec.ts` proves the welcome request starts the hosted login before the host mounts and that the mount presents the in-flight attempt.
