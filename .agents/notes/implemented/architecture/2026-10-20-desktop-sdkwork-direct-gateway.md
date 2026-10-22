# Agent Note: SDKWork clients call the environment gateway directly

Status: implemented

English | [中文](2026-10-20-desktop-sdkwork-direct-gateway.zh.md)

## Problem

The Electron shell loads the Web application from `dsh-app://app`, and the SDKWork SDK clients (IAM, App Store, feedback, Drive, Knowledge Base, IM REST) issue their own HTTP calls by appending `/app/v3/api`, `/backend/v3/api`, or `/im/v3/api` to the base URL `ctx.env` publishes. A previous change made that base the shell origin and proxied those prefixes in the Electron main process, so the page never issued a cross-origin request. That indirection hid the real gateway from every client: a knowledge call surfaced as `POST dsh-app://app/app/v3/api/knowledge/spaces` instead of a request to the environment's gateway, one surface could not point at another host, and every SDK failure was reported against the shell origin.

## Decision

**Every carrier calls the gateway its environment profile names.**

- `apiBaseUrl()` returns the active profile's `apiBaseUrl`, and `imApiBaseUrl()` returns `imApiBaseUrl` or falls back to `apiBaseUrl`. A desktop page resolves the same values a browser page does, so each environment keeps its own domain (or the loopback address a source launch selected).
- The gateway registers `dsh-app://app` as a first-party CORS origin (the web framework's `REGISTERED_SDKWORK_DESKTOP_CORS_ORIGINS`, also listed in each topology file's `SDKWORK_CORS_ALLOWED_ORIGINS`), so the shell's preflight succeeds without a proxy.
- The Electron main process no longer serves SDKWork API prefixes: it serves packaged documents and forwards authenticated Host requests only.
- The IM embed bundle receives the profile gateway as `apiBaseUrl` and derives its realtime `ws(s)` origin from it; the host passes no separate websocket base.
- `pnpm desktop:dev` selects the gateway the launch targets: `--gateway ip` (the default; `localhost` is an alias) with `--gateway-port` (default `3900` for the standalone bind), `--gateway domain` for the deployment domain (optionally with a port), a `host:port` pair, or an explicit http(s) origin. One selection is projected onto `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL`, `SDKWORK_BIRDCODER_APP_API_BASE_URL`, and `SDKWORK_IM_API_BASE_URL` for both the build and the Host.

## Alternatives considered

| Rejected | Reason |
|---|---|
| Keep the same-origin proxy | It turns the SDK base URL into a shell detail, defeats per-environment domains, and makes the desktop carrier diverge from the browser carrier; the gateway already trusts the registered desktop origin |
| Inject CORS headers in the main process | Depends on Chromium internals, and the gateway owns its CORS policy |
| Disable web security for the window | Removes isolation for every page, not only the SDKWork calls |
| Keep a desktop-only websocket base | The bundle already derives the realtime origin from the gateway; a second source of truth drifts |

## Consequences

- Desktop and browser traffic take the same path: one profile base per environment, changed in one place.
- A source launch must start the gateway the selected address names; `--print-gateway` reports the resolved origin before a build.
- Cross-origin preflights now do occur on the shell's custom scheme, so a gateway that predates the registered desktop origins rejects the shell. The topology files already list `dsh-app://app`.
- The knowledge base surface needs the gateway's embedded runtime tenant to match the IAM login tenant (`SDKWORK_KNOWLEDGEBASE_TENANT_ID`, default `1`). The gateway's development profiles inject the deployment tenant (`100001`), and any other deployment must set the same value; this is deployment configuration and is independent of how the request is addressed. The knowledge app-api has no per-route permission gate, so every signed-in user of that tenant can use spaces.

## Verification

- `apps/desktop/tests/development-gateway.spec.ts`: ip/domain/port/`host:port` resolution, port overrides, rejected selectors, and the environment projection.
- `packages/client/ui-sdkwork-env` specs: the profile gateway in every carrier, IM fallback, and per-tier defaults.
- `packages/client/ui-sdkwork-im` specs: the bundle receives the profile IM gateway as `apiBaseUrl`.
- `apps/desktop` tests: the protocol handler serves packaged documents and forwards authenticated Host requests only.
- `pnpm exec tsc -b tsconfig.client.tests.json` and `pnpm exec tsc -b apps/desktop/tsconfig.json`.
