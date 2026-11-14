# Agent Note: Host admission reads the authentication registry outside a nested-service shadow

Status: implemented

English | [中文](2026-11-14-connection-admission-nested-service-shadowing.zh.md)

## Problem

`HostConnectionService.admit()` read `this.authentication`, and `HostConnectionService` also publishes that instance as the `connection.authentication` nested service. Cordis republishes a service property that names a nested service to the *reading* Context: reading it through a plugin's `connection` proxy resolves the nested service from that plugin's inject table instead of returning the instance field. A plugin that injects only `connection` and calls the documented `ctx.connection.admit(request)` — or the `requestRejection(request)` wrapper the third-party sidebar uses — therefore failed with:

```
Error: cannot get property "connection.authentication" without inject
    at Proxy.admit (packages/client/connection/lib/index.js:434)
    at Proxy.requestRejection (...)
    at fence (dsh-better-sidebar/lib/index.js)
    at checkAuthAndMutation (sdkwork-dsh-agents/lib/...)
```

The throw surfaced as a broken app, not as an authentication answer. WebServer's per-request guard answers `400` with an empty body for a handler that rejects, so `/sidebar/api/*`, the `/sidebar/ws/agent-opens` upgrade, and the expert market's `/api/michengai/dsh-agency-agents/{sidebar-entry,online-update,composer-recommend}` routes all failed on every call while the plugins stayed `active`. Because the failing call sits on the shared admission path, each new plugin that fences its own routes inherits the same failure.

## Decision

Internal admission reads the registry through `authenticationRegistry`, a field name no `connection.*` service claims, so the nested-service association cannot intercept it. `HostConnectionService.authentication` keeps publishing the same instance for the plugins that inject `connection.authentication` and register providers through it; the class comment states why both names exist. The `webserver/authorize` listener reads the same field, so schema enforcement and direct admission agree.

## Alternatives considered

**Require every caller to inject `connection.authentication`.** That contradicts the published contract: the connection README documents `ctx.connection.admit(request)` for adapters and third-party plugins, and `requestRejection` exists for the same reason. The sidebar is a read-only submodule this repository does not patch, and the expert market is a third-party mirror, so the requirement would have to change the plugin ecosystem rather than the service that owns the instance.

**Rename the published field and expose credentials differently.** `connection.authentication` is the documented injection surface for `AuthenticationProvider` registration and for credential-only verification; renaming it breaks providers in unrelated packages to fix a name collision inside one class.

**Answer 500 from WebServer instead of 400.** That keeps the throw and merely relabels the symptom; the request would still never reach the route's own authorization answer.

**Read the registry from the definition-site Context inside `admit`.** The service method runs with a caller-scoped receiver, so `this.ctx` is the caller, not the Context that injected the registry; the field is the only name that resolves to the owning instance.

## Consequences

Plugins that inject only `connection` get the documented admission answer again, so a fenced route no longer fails silently with an empty `400`. Nothing changes for plugins that inject `connection.authentication` — the association and the provider registry are untouched. The class now holds the same instance under two names, one public association surface and one internal read; the comment on `authenticationRegistry` records the reason so a later cleanup does not collapse them.

## Verification

`packages/client/connection/tests/authentication.host.spec.ts` adds `admits a request for a plugin that injects only connection`, which boots a plugin that injects `connection` and calls both `admit` and `requestRejection`. Without the fix it fails with the production error above; with it, admission returns the registered Peer and `requestRejection` returns `undefined`. The package suite passes (`vitest run packages/client/connection/tests`, 215 tests). On the desktop `--online` development lane the request log answered `200` for `/sidebar/api/settings.get`, `/sidebar/api/session.phase`, and the three expert-market routes, and the sidebar stopped logging `agent-opens connection failed`.
