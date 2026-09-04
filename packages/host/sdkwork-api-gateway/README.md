---
description: "Sdkwork /api carrier extras: the privileged /api dispatch fallback over the mounted apiProxy and the two server-to-browser WebSocket event downlinks, provided as slot services for the connection host face."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-api-gateway

English | [中文](README.zh.md)

## Summary

The sdkwork /api carrier extras, node half. The package provides the two slot services the `connection` host face (`@deepseek-ai/dsh-client-connection`) consumes through `src/sdkwork-gateway-slot.ts`: `sdkworkApiFallback`, the privileged /api dispatch fallback that answers the requests Connection's own routes decline (loopback-pinned methods plus the mounted apiProxy gateway), and `sdkworkEventUpgrades`, the two server-to-browser WebSocket event downlinks. Connection keeps the trust fence and route registration; this package owns the apiProxy-facing machinery.

The slot indirection exists because upstream's `file-upload` host face references Connection's host face, and the session controller reaches file-upload — a compile-time Connection → apiProxy reference would close a `tsc -b` project cycle. With the slots, Connection's host face stays free of that dependency and the apiProxy-facing code lives in this fork-owned package, where upstream merges cannot collide with it.

The default export mounts as the `sdkwork-api-gateway` plugin. It provides `sdkworkApiFallback` immediately (the fallback reads the apiProxy lazily per request, so absence answers 404) and provides `sdkworkEventUpgrades` once `apiProxy` mounts, owning the downlink sockets' disposal. The `./desktop` subpath is the desktop carrier node half: the `desktop-connection` plugin injects Connection's `connection` service, reuses its shared fetch handler with the same fallback, and provides the `desktopBridge` host service the Electron main process wires to IPC.

The desktop composition (`sdkwork-desktop-app` bundle) mounts both rows; the web composition mounts neither, because it runs without apiProxy and the slots stay unresolved — the same inert behavior as the pre-slot wiring.
