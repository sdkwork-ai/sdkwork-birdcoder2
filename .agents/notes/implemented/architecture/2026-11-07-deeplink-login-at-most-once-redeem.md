# Agent Note: A deep-link login redeems its single-use code at most once

Status: implemented

English | [中文](2026-11-07-deeplink-login-at-most-once-redeem.zh.md)

## Problem

The desktop browser login hands the app a one-time authorization code, and the app redeems it through the generated `oauth.desktopSessions.create` resource. Two properties of that call disagreed with the code it carries.

The generated transport retries every request up to three times on transport failures, timeouts, 5xx, and 429. Each of those is a case where the server may already have consumed the code: the retry then returns "OAuth authorization code is invalid or expired", the runtime reports `exchange-failed`, and the user is told the login failed although the browser completed it and a server session may exist without a client. A local proxy or a gateway 502 is enough to hit it.

The pending flow also outlived the server's own window. The client waited ten minutes (`DEFAULT_DESKTOP_FLOW_TTL_MS`), while the IAM authorization state expires five minutes after the hosted page created it and the redeem requires it unexpired. A dictionary-slow login, or a hand-off clicked late, therefore reached a still-waiting card and a code the server could only reject — the same `exchange-failed` card, with nothing naming the real cause: the card rendered a localized line and the runtime's reason never left the failure object.

A repeated delivery had the same shape. The hosted success page fires the deep link and offers it as a link, and the desktop bridge keeps a live callback as the launch URL as well as forwarding it, so the same code can be presented twice — concurrently, or to a renderer that loads after the event.

## Decision

The redeem leg is at-most-once. `createIamDesktopLogin` binds the desktop runtime to a redeem client built over the generated transport with `retry: { maxRetries: 0 }`, and that client remembers the one code it submitted for the login's lifetime: a second delivery of the same callback observes the first request's outcome instead of redeeming again. Recovery from a genuinely failed redeem is the card's retry, which starts a fresh browser login with a new code, so caching a settled failure costs nothing a user could act on.

The pending flow's deadline is four and a half minutes (`IAM_DESKTOP_LOGIN_WINDOW_MS`), derived from the server's five-minute authorization window with slack for opening the browser and the hand-off travelling back. A callback that arrives after it is reported as an expired login, not as a failed exchange of a login that was still waiting.

The failure's reason is shown and logged. The service keeps the runtime's `code`, `message`, and `detail` as one failure record, prints it to the console, and the hand-off card renders the localized step line followed by the verbatim reason under it — textual wire data, never localized.

The bridge keeps its live callback as the launch URL as well as forwarding it, because a window that is still loading must not lose the hand-off; the at-most-once redeem makes that replay harmless instead of a second redemption.

## Alternatives considered

**Keep the generated resource and accept its retry.** The retry is the transport default for every operation, and for every other operation it is correct. For a single-use code it can only produce a false failure after a real success, and the product cannot distinguish the two outcomes.

**Retry the redeem deliberately on a transport error.** The code may or may not have been consumed server-side; presenting the same code again either fails or, worse, races the attempt that actually succeeded. Starting a new browser login is the only outcome the app can guarantee.

**Wait the runtime's ten minutes and explain the failure when the code is rejected.** The wait keeps a dead attempt alive long after the code expired, and the user sees a redeemed-code error for a login that never had a chance; the deadline now matches the server's.

**Show only the localized line.** That was the shipped card. It is right about the step and wrong about the cause, and the machine that reported this defect left no record of what the server said.

**Deliver the live callback without keeping it as the launch URL.** That removes the replay path, but a window that is still loading loses the hand-off entirely and the login hangs until its deadline; the at-most-once redeem makes the retained URL safe.

## Consequences

A lost redeem response, a 502 behind a proxy, and a duplicated deep link all stop producing a failure notice for a code the server accepted. A late hand-off reports an expired login, which the card's retry and the in-app fallback both resolve. Every future failure carries its reason in the card and in the console, so a support report can name the offending step instead of "login did not finish".

The tests pin each property: the redeem port sends one POST with `retry: { maxRetries: 0 }` for one code and a second one for a new code, the service forwards the four-and-a-half-minute window, the card renders the host's reason under the named step, and a second delivery of the same code observes the first attempt instead of redeeming again. [The package reference](../../../../packages/client/ui-sdkwork-iam/README.md) states the redeem and window contract.
