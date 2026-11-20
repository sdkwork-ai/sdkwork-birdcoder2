# Agent Note: A deep-link login callback reaches the process that owns its PKCE flow

Status: implemented

English | [中文](2026-11-20-deeplink-login-multi-process-handoff.zh.md)

## Problem

The desktop browser login returns through a custom URL scheme (`birdcoder://auth/callback`). An operating system keeps one handler association per scheme, so when a release build and a development build run at the same time, both register the same `birdcoder://` scheme and the last `setAsDefaultProtocolClient` call — or whichever build the OS otherwise prefers — receives the callback. The release build therefore commonly receives a login started in the development build.

A callback delivered to the wrong process cannot complete the login. The pending PKCE flow, including its `state` and verifier, lives in the initiating renderer's storage; the receiving renderer has no matching flow, reports a stale/foreign callback, and the initiating renderer waits until its four-and-a-half-minute deadline. Protocol ownership is not something the application can control across two processes that both legitimately register the scheme.

## Decision

The primary path is the RFC 8252 loopback redirect. Every Desktop main process can host a per-attempt listener on `127.0.0.1:<ephemeral-port>/auth/callback`; the renderer presents that address as `redirect_uri`, and the IAM desktop-auth runtime validates the returned `state`/PKCE against it exactly as it does for a deep link. The listener binds loopback, accepts only `GET` on the callback path with a matching `Host`, answers a localized, script-free result page, and keeps listening until the renderer settles the flow (a forged local callback must not close it); cancel and the timeout stop it. A development launch enables this by default and falls back to the registered custom scheme when the shell declines; a packaged build enables it with `sdkwork.iamLoopbackRedirect: true` in its OEM profile (or `DSH_DESKTOP_IAM_LOOPBACK=1`) once its IAM client allows loopback redirects. The backend contract is `http://127.0.0.1:<any-port>/auth/callback` for the desktop public client (RFC 8252 §7.3), PKCE required, no client secret. This path has no OS association at all, so it also separates two installations of the same channel.

For clients that still use the fixed custom scheme — the transition window, an older packaged build, or a tenant that has not allowed loopback yet — every Desktop process also joins a local relay keyed by the brand's protocol. The relay:

- starts a loopback HTTP listener on `127.0.0.1` with an ephemeral port and publishes `{ pid, endpoint, token }` as a `0600` file under a per-user `0700` directory in the OS temp root;
- shares every callback the OS hands it — `open-url`, `second-instance`, and a launch argument — with every other live instance, after delivering it locally;
- delivers a peer's callback to the local renderer through the same `sdkwork:deepLinks:open` path, without re-broadcasting it;
- spools a callback for ten minutes so an instance that starts after the link still receives it (the IAM authorization window is five minutes);
- rejects requests that are not loopback, carry no per-instance token, exceed 8 KiB, or are not the registered callback shape.

Each renderer sees the callback and only the one holding the pending PKCE flow redeems it; the others classify it as a no-pending-flow/state-mismatch callback and stay silent. Correctness therefore does not depend on which process owns the OS protocol, on `setAsDefaultProtocolClient` ordering, or on the two channels sharing a profile. The token in the relay is a local delivery credential, not an OAuth secret; the relayed URL contains a single-use authorization code bound to the initiator's verifier.

The relay is best-effort at the transport layer: a failed start or an unreachable peer is logged, never raised into the OS handler or the plugin, and the local handler keeps working for the process that owns the scheme.

## Alternatives considered

**Give the development build its own scheme.** The cleanest native-app separation, but the OEM profile requires the redirect scheme to equal the brand manifest's `desktop.protocol`, and the IAM OAuth client must register the new redirect URI. That is a deployment change for every development channel, and it still fails when two processes register the same scheme (for example two development lanes).

**Use loopback without a backend allowlist.** RFC 8252's preferred approach, and the primary path here, but it only works once the IAM OAuth client allows `http://127.0.0.1:<port>/auth/callback`; without that deployment change the authorize page rejects the request, so the custom-scheme relay remains for tenants that have not applied it.

**Make the release build a broker that forwards by the callback's `state`.** The `state` is generated inside the IAM desktop-auth runtime and is not exposed to the shell, so the broker cannot map it to the initiating process without changing that dependency. Broadcasting the whole URL needs no state access and works for any number of processes.

**Register the scheme only while a login is pending.** The OS association is persistent and there is no portable API to restore the previous handler; two simultaneous logins would still race, and macOS's LaunchServices preference can override the registration.

## Consequences

- With loopback enabled, a login always returns to the process that started it; the OS protocol association is not involved, and two installations of the same channel stay apart. The listener disappears when the login completes, is cancelled, or times out; a login whose app exits mid-flight cannot be completed on relaunch (the port is gone), which the hand-off card reports as an expired attempt.
- With the custom-scheme fallback, a callback always reaches the process with the pending flow while both processes run, regardless of OS protocol ownership.
- A fallback callback that arrives before the owning process starts is held in the spool for ten minutes; reopening the owning build within that window completes the login.
- One extra loopback listener and a small registry entry exist while Desktop runs; both disappear on normal quit. After a crash, the next start prunes entries whose PID is gone.
- Verification: `apps/desktop/tests/iam-loopback-redirect.spec.ts` (loopback listener, rejection, timeout, replacement), `apps/desktop/tests/iam-deep-link-relay.spec.ts` (broadcast, spool, auth rejection, stale cleanup, dispose), the extended `apps/desktop/tests/iam-deep-links.spec.ts` (peer delivery, OS callback sharing), the IAM end-to-end loopback/fallback cases, and the startup suite that mounts the shell.
