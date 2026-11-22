---
description: "SDKWork adaptive chooser of the directory-picker seam: samples the host situation once at boot and mounts the SDKWork composed backend on an attended host, or the browse backend for remote clients."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-directory-picker-auto

English | [中文](README.zh.md)

## Summary

Picks the directory-picking interaction for every boot of the Web GUI: it samples the host's situation once and mounts the matching backend together with its browser surface, as real Loader entries in the in-memory root tree. An attended host gets the [composed](../sdkwork-directory-picker-composed/README.md) backend, so the workspace picker stays the OS dialog while the governed browse verbs keep serving in-app surfaces; anything remote or headless gets the [browse](../directory-picker-browse/README.md) backend, as the [upstream chooser](../directory-picker-auto/README.md) does. Pin an interaction by composing that backend row directly.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

Compose this plugin instead of a concrete backend when one composition must serve hosts that differ: local workstation sessions where a native chooser works, and remote or headless sessions where only the in-app browser works.

### How the choice is made

The resolution reuses the upstream chooser's boot-time sample verbatim — no remote-authority trust, a loopback-only bind, a non-SSH launch, and a servable display session are all required for a native arm; anything ambiguous resolves to `browse`. What differs is only the native arm: it mounts the composed backend, because a desktop boot must keep serving the governed browse wire verbs to in-app surfaces.

### What you get

Both packages are created as ordinary Loader entries and torn down with this plugin: the backend registers `ctx.directoryPicker` and the surface's browser half is discovered by the client module table exactly as a config row's would be. Removal runs in reverse order and joins each entry's fiber teardown, so unloading the chooser returns only after both faces quiesced; a failed mount unmounts what it already created before rethrowing, so a retry cannot collide with its own `directoryPicker` registration.

## Understand the implementation

`apply` resolves one backend kind, then mounts `BACKEND_PACKAGES[kind]` and `SURFACE_PACKAGES[kind]` inside `ctx.effect`, which owns the disposer.

| Resolved kind | Backend | Browser surface |
|---|---|---|
| `native` | `@deepseek-ai/dsh-sdkwork-directory-picker-composed` | `@deepseek-ai/dsh-client-ui-directory-picker-native` |
| `browse` | `@deepseek-ai/dsh-host-directory-picker-browse` | `@deepseek-ai/dsh-client-ui-directory-picker-browse` |

The root tree's `commit(change)` is a no-op, so these rows can never be persisted back into a config file. `BACKEND_PACKAGES` and `SURFACE_PACKAGES` are exported because the references are runtime strings the static config gate cannot see in a `cordis.yml` row: every app composing this chooser must declare those package names as dependencies.

## Dev Note

The row mounts one backend; the platform-specific picker owns every dialog.

## Model Experience

None, as the chooser only mounts a backend row and its browser surface through the Loader; it registers no tool, prompt section, or session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Platform behavior is delegated to the mounted backend** — this package samples and mounts; the OS chooser, the guided browse listing, and every platform difference belong to the native and browse backends, and a wrong resolution surfaces as the backend's own failure rather than a chooser error.
- **Detection infers operator location from launch context** — a detached tmux session loses its `SSH_*` markers, a Darwin process outside an Aqua session still counts as displayed, and a workstation-local launch later reached through `ssh -L` arrives from `127.0.0.1`; composing the browse or composed row directly is the safe choice for deployments the probe cannot prove.
- **The sample happens once per boot** — one resolution serves every client of that boot; per-connection adaptivity would need a per-client capability the seam does not carry.
