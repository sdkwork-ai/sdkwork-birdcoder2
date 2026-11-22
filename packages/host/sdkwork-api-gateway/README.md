---
description: "Sdkwork /api carrier extras: the privileged /api dispatch fallback over the mounted apiProxy and the two server-to-browser WebSocket event downlinks, provided as slot services for the connection host face."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-api-gateway

English | [中文](README.zh.md)

## Summary

The sdkwork /api carrier extras, node half: the two slot services the `connection` host face consumes. `sdkworkApiFallback` answers the /api requests Connection's own routes decline — loopback-pinned methods plus the mounted apiProxy gateway — and `sdkworkEventUpgrades` owns the two server-to-browser WebSocket event downlinks. Connection keeps the trust fence and route registration; this package owns the apiProxy-facing machinery, and without it the whole apiProxy domain answers 404.

## Table of Contents

- [Summary](#summary)
- [Dev Note](#dev-note)

## Understand the implementation

The slot indirection exists because upstream's `file-upload` host face references Connection's host face, and the session controller reaches file-upload — a compile-time Connection → apiProxy reference would close a `tsc -b` project cycle. With the slots, Connection's host face stays free of that dependency and the apiProxy-facing code lives in this fork-owned package, where upstream merges cannot collide with it.

The default export mounts as the `sdkwork-api-gateway` plugin. It provides `sdkworkApiFallback` immediately (the fallback reads the apiProxy lazily per request, so absence answers 404) and provides `sdkworkEventUpgrades` once `apiProxy` mounts, owning the downlink sockets' disposal. The `./desktop` subpath is the desktop carrier node half: the `desktop-connection` plugin injects Connection's `connection` service, reuses its shared fetch handler with the same fallback, and provides the `desktopBridge` host service the Electron main process wires to IPC.

The web-app bundle mounts both rows — the renderer speaks the apiProxy wire dialect on every carrier, so without them the whole apiProxy domain (workspace.list, host.describe, host.openPath, …) answers 404. The desktop carrier's overlay keeps the rows mounted by that bundle and only overrides the apiproxy row with `nativeOpen: true`; the vestigial `sdkwork-desktop-app` bundle still inserts them too, but nothing loads that bundle.

## Dev Note

The fallback reads the apiProxy lazily per request, so the package keeps no compile-time reference to the apiProxy package from the connection host face (the `tsc -b` project cycle stays broken); the desktop half reuses the identical fallback through the `./desktop` subpath.

## Model Experience

None, as the package only dispatches /api requests and event upgrades between browser and host; it registers no tool, prompt section, or session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No apiProxy row means no carrier** — `sdkworkApiFallback` answers 404 for the whole apiProxy domain while the apiProxy row is absent, and `sdkworkEventUpgrades` is provided only once `apiProxy` mounts, so no event downlink opens before then.
- **The fallback serves loopback callers only** — the privileged /api dispatch admits the loopback-pinned methods plus the mounted apiProxy gateway; a remote browser's access is the Connection trust fence's decision, not this package's.
- **The desktop half reuses the web fallback verbatim** — `./desktop` injects Connection's `connection` service and wires the same fallback over IPC, so a change to fallback behavior must land in both faces.
