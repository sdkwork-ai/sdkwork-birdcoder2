# Agent Note: Explicit web bind address

Status: implemented

English | [中文](2026-07-22-web-bind-address.zh.md)

## Problem

The Web application can run commands with the Host user's authority. Same-machine use needs only loopback reachability, while an all-interface CLI mode would imply a supported network deployment without TLS or a defined proxy contract.

The HTTP carrier also hides the bind address inside `startWebServer()`, so alternate shells cannot state their own network policy at the package boundary.

## Decision

`dsh web` binds `127.0.0.1` by default. The CLI accepts `--host 0.0.0.0` as the explicit all-interface mode and rejects other values so its network modes remain a small, deliberate contract. The CLI's all-interface mode is additionally gated by `--allow-non-loopback`; the [explicit non-loopback Web deployment opt-in](2026-08-15-explicit-non-loopback-web-opt-in.md) owns that deployment decision. The process-token and browser-cookie authentication does not broaden that deployment contract ([decision](../architecture/2026-08-24-browser-token-authentication.md)). All-interface mode keeps printing the loopback URL and, when available, the first external IPv4 URL.

`WebServer` still requires `host: '127.0.0.1' | '0.0.0.0'` and passes it to `node:http` without a fallback. The generic carrier leaves custom composition policy visible at its package interface; the product CLI owns the stricter loopback choice.

## Alternatives considered

**Keep `0.0.0.0` as the default.** Rejected because ordinary same-machine use does not need network-wide reachability and should not acquire it implicitly.

**Use a boolean exposure flag.** Initially rejected because `--host 0.0.0.0` names the resulting socket behavior directly and matches the underlying server option without introducing a second term. The later deployment requirement supersedes that part of the decision: `--allow-non-loopback` now gates this host mode; the [explicit non-loopback Web deployment opt-in](2026-08-15-explicit-non-loopback-web-opt-in.md) records why.

**Keep an explicit `--host 0.0.0.0` mode without `--allow-non-loopback`.** Rejected because authentication alone does not supply TLS, forwarding semantics, or a supported remote-deployment contract for the tool-capable Host.

**Default inside `startWebServer()`.** Rejected because the carrier has multiple possible shells and no basis for choosing their deployment policy. Requiring `host` makes the choice visible at every assembly call.

## Consequences

Local `dsh web` starts remain reachable at `http://127.0.0.1:3080`; a browser on another machine must opt in with `dsh web --host 0.0.0.0 --allow-non-loopback` and provide an authenticated deployment boundary. The CLI does not yet expose custom interface addresses or IPv6 modes, while programmatic carrier consumers retain that flexibility. Server tests pin both loopback and all-interface forwarding into the Node listen boundary, and startup tests cover the explicit opt-in.
