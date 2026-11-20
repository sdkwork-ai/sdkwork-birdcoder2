# Agent Note: A deep-link login callback reaches the process that owns its PKCE flow

Status: implemented

English | [中文](2026-11-20-deeplink-login-multi-process-handoff.zh.md)

## Problem

The desktop browser login returns through a custom URL scheme (`birdcoder://auth/callback`). An operating system keeps one handler association per scheme, so when a release build and a development build run at the same time, both register the same `birdcoder://` scheme and the last `setAsDefaultProtocolClient` call — or whichever build the OS otherwise prefers — receives the callback. The release build therefore commonly receives a login started in the development build.

A callback delivered to the wrong process cannot complete the login. The pending PKCE flow, including its `state` and verifier, lives in the initiating renderer's storage; the receiving renderer has no matching flow, reports a stale/foreign callback, and the initiating renderer waits until its four-and-a-half-minute deadline. Protocol ownership is not something the application can control across two processes that both legitimately register the scheme.

## Decision

The production default is the registered custom scheme plus a state-routed local relay: it needs no IAM change, keeps cold-start relaunch working, and is the pattern most installed desktop applications use. The RFC 8252 loopback redirect is implemented as a per-deployment opt-in for the cases where per-process isolation outweighs those benefits. Every Desktop main process can host a per-attempt loopback listener on `127.0.0.1:<ephemeral-port>/auth/callback`; the renderer presents that address as `redirect_uri`, and the IAM desktop-auth runtime validates the returned `state`/PKCE against it exactly as it does for a deep link. The listener binds loopback, accepts only `GET` on the callback path with a matching `Host`, answers a localized, script-free result page, and keeps listening until the renderer settles the flow (a forged local callback must not close it); cancel and the timeout stop it. Loopback stays off until the deployment enables it (`sdkwork.iamLoopbackRedirect: true` in the OEM profile, or `DSH_DESKTOP_IAM_LOOPBACK=1`), and falls back to the registered custom scheme otherwise. Enabling it before the tenant registers the loopback redirect makes the hosted authorize page reject the request (`OAuth redirect_uri is not registered for this client`) before any callback reaches the app. The backend contract is `http://127.0.0.1:<any-port>/auth/callback` for the desktop public client (RFC 8252 §7.3), PKCE required, no client secret. This path has no OS association at all, so it also separates two installations of the same channel.

It is not the default because it costs that registration and cannot complete a login after the app exits.

The default relay path needs no IAM change. Every Desktop process joins a local relay keyed by the brand's protocol. The relay:

- starts a loopback HTTP listener on `127.0.0.1` with an ephemeral port and publishes `{ pid, endpoint, token }` as a `0600` file under a per-user `0700` directory in the OS temp root;
- records the `state` of each hosted authorize URL the renderer opens (`states/<hash>.json`, `0600`) and routes a callback with a known state directly to the owning instance, so the authorization code normally never reaches another process;
- falls back to broadcasting to every live instance when the state is unknown (an older client) or the owner is gone, after delivering it locally;
- delivers a peer's callback to the local renderer through the same `sdkwork:deepLinks:open` path, without re-broadcasting it;
- spools a callback for ten minutes so an instance that starts after the link still receives it (the IAM authorization window is five minutes);
- rejects requests that are not loopback, carry no per-instance token, exceed 8 KiB, or are not the registered callback shape.

Each renderer sees the callback and only the one holding the pending PKCE flow redeems it; the others classify it as a no-pending-flow/state-mismatch callback and stay silent. Correctness therefore does not depend on which process owns the OS protocol, on `setAsDefaultProtocolClient` ordering, or on the two channels sharing a profile. The token in the relay is a local delivery credential, not an OAuth secret; the relayed URL contains a single-use authorization code bound to the initiator's verifier.

The relay is best-effort at the transport layer: a failed start or an unreachable peer is logged, never raised into the OS handler or the plugin, and the local handler keeps working for the process that owns the scheme.

## Alternatives considered

**Give the development build its own scheme.** The cleanest native-app separation, but the OEM profile requires the redirect scheme to equal the brand manifest's `desktop.protocol`, and the IAM OAuth client must register the new redirect URI. That is a deployment change for every development channel, and it still fails when two processes register the same scheme (for example two development lanes).

**Use loopback without a backend allowlist.** RFC 8252's preferred approach, and the primary path here, but it only works once the IAM OAuth client allows `http://127.0.0.1:<port>/auth/callback`; without that deployment change the authorize page rejects the request, so the custom-scheme relay remains for tenants that have not applied it.

**Ask the IAM runtime for a routing id instead of observing the authorize URL.** The runtime keeps `state` internal, but the shell already sees the full authorize URL when the renderer asks it to open the browser, so the relay records that `state` before the browser opens and needs no SDK change. Broadcasting remains the fallback for a callback whose state was never recorded.

**Register the scheme only while a login is pending.** The OS association is persistent and there is no portable API to restore the previous handler; two simultaneous logins would still race, and macOS's LaunchServices preference can override the registration.

## Consequences

- With loopback enabled, a login always returns to the process that started it; the OS protocol association is not involved, and two installations of the same channel stay apart. The listener disappears when the login completes, is cancelled, or times out; a login whose app exits mid-flight cannot be completed on relaunch (the port is gone), which the hand-off card reports as an expired attempt.
- With the custom-scheme fallback, a callback always reaches the process with the pending flow while both processes run, regardless of OS protocol ownership.
- A fallback callback that arrives before the owning process starts is held in the spool for ten minutes; reopening the owning build within that window completes the login.
- One extra loopback listener and a small registry entry exist while Desktop runs; both disappear on normal quit. After a crash, the next start prunes entries whose PID is gone.
- Verification: `apps/desktop/tests/iam-loopback-redirect.spec.ts` (loopback listener, rejection, timeout, replacement), `apps/desktop/tests/iam-deep-link-relay.spec.ts` (state routing, broadcast fallback, spool, auth rejection, stale cleanup, dispose), the extended `apps/desktop/tests/iam-deep-links.spec.ts` (peer delivery, OS callback sharing, authorize URL reporting), the IAM end-to-end loopback/fallback cases, and the startup suite that mounts the shell.
