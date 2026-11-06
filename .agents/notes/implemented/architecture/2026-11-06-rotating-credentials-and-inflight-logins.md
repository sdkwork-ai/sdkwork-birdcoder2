# Agent Note: Rotating credentials and in-flight logins stay honest

Status: implemented

English | [中文](2026-11-06-rotating-credentials-and-inflight-logins.zh.md)

## Problem

Three defects survived the first pass over the desktop browser login, and each one only appears after the login "succeeded".

The pre-expiry refresh committed its new tokens to the token store, and the store's change hook then republished the *controller's* session — which still carried the pre-refresh pair, because a scheduled refresh never touches controller state. The result was a session that kept renewing in storage while every SDK client kept sending the access token that was about to expire, then failed with 401 an hour later until the app restarted.

A token rotation writes tokens only. The cached identity and the AppContext were not preserved across that write, so a refresh could blank the account row after the next launch even though the durable session still authenticated.

The deep-link bridge kept its "this launch carried a callback" flag for the whole process. Startup uses that flag to open the workspace instead of the welcome screen; after a sign-out and a window close on macOS the same flag made the shell skip the welcome screen it should have shown. Separately, a callback the controller refused to consume — a stale link, a forged state, or the OS delivering the same callback twice — was reported through the failure channel, flipping the hand-off card to failed while the real login was still pending in the browser.

## Decision

The token store is the credential authority for the shared transport. Every read, write, and clear reports its snapshot; the service keeps the last observed session and publishes *that* to the shared `TokenManager`, falling back to controller state only while nothing has been observed. A controller state change therefore republishes the refreshed pair instead of the stale one.

A session write merges over the record it replaces: a snapshot that names no `user`, `context`, or `sessionId` inherits those from the durable copy it overwrites. A new login still replaces the identity it carries; a rotation cannot erase what it cannot restate.

The bridge's launch-callback flag retires when the renderer takes the URL. Startup captures it once, before any window exists, and decides the first window from that captured value; later decisions see the retirement, so a signed-in launch no longer suppresses the welcome screen after a sign-out.

A callback failure only counts as a login failure when the attempt is no longer pending, and `no-pending-flow` and `state-mismatch` never count: the controller deliberately keeps the flow on a foreign or stale link so the real callback can complete it, and a second delivery of a consumed callback is not a failed login.

## Alternatives considered

**Publish from the store on every controller emit (async read).** Correct but turns a synchronous subscription into an I/O path on every state change; the observed snapshot is equivalent and cheap.

**Let the refresh update controller state.** The SDK's scheduled refresh is shared with every host and deliberately does not touch product state; making the timer emit would put a second writer on the controller for a value that only credentials consumers read.

**Keep the launch flag for the process lifetime.** That was the earlier contract, and it silently swapped the welcome screen for the workspace on a later sign-out.

**Report every rejected callback.** Users then see "login failed" while the browser is still signing in, and the offered retry replaces a PKCE flow that was still valid.

## Consequences

The refreshed pair reaches every SDK client without a restart, and the relay credential mirrored from `<DSH_HOME>/iam/session.json` follows the same value. A rotation keeps the cached identity and AppContext, so the account row survives a launch. A stale, forged, or duplicate callback leaves the pending attempt and its card alone, and a launch that signed in shows the welcome screen again after a sign-out.

The regression suite pins all of it: a real scheduled refresh driven by a short-lived JWT-shaped token must replace the shared credentials and survive a later controller emit; the token store must keep identity and context across a token-only write; the bridge must retire its launch flag on the take; a repeated callback and a stale callback must leave `browserSignInFailed()` false while the attempt continues. [The package reference](../../../../packages/client/ui-sdkwork-iam/README.md) states the credential and failure behavior.
