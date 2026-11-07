# Agent Note: A redeemed deep-link login commits the same state as the in-app form

Status: implemented

English | [中文](2026-11-06-deeplink-login-post-login-state.zh.md)

## Problem

The desktop browser login redeems its authorization code outside the sdkwork auth service: `@sdkwork/iam-desktop-auth` hands back a dual-token session and the product commits it itself. That commit used to write the durable session, apply it to the controller, and publish the tokens — no more. The in-app form does one thing more: after committing the tokens it reads `/iam/users/current` and merges that profile over the login payload before the session reaches the controller. So a user who signed in through the browser got a session whose cached identity was only what the exchange payload happened to carry, a stale or empty name in the account row after the next launch, and a hand-off card that reported every failure as "the browser login page could not be opened" — including a refused authorization, a rejected code exchange, and an expired flow.

## Decision

`IamService.commitDesktopSession` owns the whole post-exchange sequence, in this order: persist the complete session (dual tokens, rotating `refreshToken`, `sessionId`, AppContext); resolve the runtime; publish the tokens into the shared `TokenManager`; read the account profile and merge it over the exchange identity; replace the durable record with the merged identity; schedule the pre-expiry refresh; apply the session to the controller; clear the failure; close the hand-off surface.

Three properties make that ordering deliberate. The runtime is resolved before the tokens are published, because building it re-seeds the shared manager from the controller, and on a first login the controller has no session yet — publishing first would then wipe the credentials the profile read needs. The durable token write is the gate: a rejected write rejects the commit and leaves the application signed out, which is the promise the storage mode documents. The profile read is bounded (5 s) and best-effort: the login has already succeeded when it runs, so a slow or failing account endpoint degrades the cached identity to the exchange payload instead of failing the login, and its own write failure keeps the identity that already reached storage. A refusal is the one exception: a 401/403 means the gateway does not accept the credentials every SDK client would use, so the commit discards the session it just wrote, reports `session-rejected` on the card, and leaves the application signed out rather than looking signed in while every later call fails.

The hand-off card also names the failing step. `SdkworkDesktopAuthError` already carries a stable code and a reason; the service keeps that pair as the last failure and clears it when an attempt starts or succeeds, and the overlay renders one localized line for the known codes, followed by the host's own reason.

## Alternatives considered

**Depend on the exchange payload alone.** It carries an id and sometimes an e-mail; the display name, split name, and initials a header renders would then derive from whatever that payload said, which is exactly the identity that goes stale across launches.

**Read the profile lazily, after the login is reported complete.** It keeps the commit short, but every surface then has to handle an identity that changes underneath it, and a second durable write still has to happen somewhere.

**Fail the login when the profile read fails.** The tokens are already valid and the code is already consumed; reporting a failure would force a fresh browser round trip for a cosmetic read.

**Keep the single generic failure line.** It was accurate for one cause (the browser would not open) and wrong for the rest, which are the common ones on a misconfigured tenant.

## Consequences

The deep-link login reaches the same post-login state as the in-app form: the controller session carries the AppContext and the hydrated identity, the shared `TokenManager` carries both tokens before any authenticated read, the account row and the account page render the same name in both paths, and the pre-expiry refresh is scheduled from the same helper. The Host side is unchanged: `<DSH_HOME>/iam/session.json` is written by the same commit either way, and the relay credential mirror reads that file.

The regression suite covers the chain with the real desktop bridge, the real auth runtime, and the real token store: exchange, authenticated profile read, merged identity, controller state, SDK headers, account row, a held backend call released, and the refused-authorization, rejected-exchange, and expired-flow failures. Stored identities from an older build keep working because the restore path still derives the split name and initials when the record carries only a display name. [The package reference](../../../../packages/client/ui-sdkwork-iam/README.md) states the sequence.
