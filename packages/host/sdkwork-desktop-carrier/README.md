---
description: "The Electron desktop carrier: the webServer-service-shaped route registry the desktop shell drives from its app:// protocol handler instead of node:http."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-desktop-carrier

English | [中文](README.zh.md)

## Summary


The Electron desktop carrier (default-exported `DesktopWebServer`, config `{host, port}`): the `webServer`-service-shaped route registry the desktop shell drives from its `app://` protocol handler instead of node:http. It knows no harness concepts and serves no files — `register(route)`, `registerFallback(handler)`, `tapIndex(transform)`, and `applyIndexTaps(html)` mirror the web carrier's registries so the web composition (client-modules bundle route + boot-manifest index tap, frontend-static dist fallback, ui-theme index tap) mounts unchanged over it. `registerUpgrade(route)` exists for structural parity and is never dispatched: the desktop shell carries event streams over IPC, not sockets. A duplicate path within either table throws because route patterns are a composition-level contract and a collision is a misconfiguration; every registration returns a disposer that removes it. `host` and `port` are informational (the shell opens no socket); `host` accepts the same two literals as the web carrier.

`dispatch(request)` is the protocol handler's entry point: it matches the request's pathname (exact over the whole table, then longest prefix, then the fallback handler), runs the handler against a node:http-shaped request/response shim (handlers read `req.method`/`req.url` and write `res.writeHead`/`res.end`), and materializes the collected status, headers, and body into a `Response`. An unparsable request URL answers 400; an unmatched request with no fallback answers 404; a handler throw answers 400, or 500 when headers already went out, and is logged as a warning — it never exits the process.

The desktop shell's `sdkwork-desktop-app` bundle swaps the web carrier's `webserver` row for this package, and the app's protocol registration calls `dispatch` per request. This package never prints; it has no URL line because the shell has no URL.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is a desktop carrier between the app:// protocol and the routes other plugins register; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No HTTP surface** — the carrier is intentionally transport-less: remote access to a desktop shell is a later milestone and would add a real listener, not this package.
- **Upgrade registrations are inert** — `registerUpgrade` holds routes for interface parity with the web carrier; nothing dispatches them today.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The carrier knows no harness concepts and serves no files: it only mirrors the web carrier's route registries (`register`, `registerFallback`, `tapIndex`, `applyIndexTaps`) so the web composition mounts unchanged — deviating from that registry shape is a cross-package change. A duplicate path in either table throws by design because route patterns are a composition-level contract, and `registerUpgrade` exists purely for interface parity and is never dispatched.

</details>
