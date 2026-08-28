---
description: "The dsh desktop-surface bundle: the Electron patch layer over dsh-base + dsh-web-app plus the desktop surface prompt glue, with the bundle patch declared by the dsh.bundle.patch manifest."
kind: "package-bundle"
---

# @deepseek-ai/dsh-sdkwork-desktop-app

English | [中文](README.zh.md)

## Summary


The dsh desktop-surface bundle: the Electron patch layer over `dsh-base` + `dsh-web-app`, plus the desktop surface prompt glue (default-exported runtime glue `@deepseek-ai/dsh-sdkwork-desktop-app`, bundle patch declared by the `dsh.bundle.patch` manifest). Applied after the web bundle, the patch swaps the browser carrier without changing the harness tree: the HTTP `webserver` row is disabled and the [`dsh-host-desktop-carrier`](../../host/sdkwork-desktop-carrier/README.md) row provides the same `webServer` service driven by the shell's `app://` protocol handler, the `web-runtime` row keeps mounting the frontend dist through the carrier's fallback seat but prints no URL and registers no web-surface prompt (a desktop shell has no URL), the `connection` row stays mounted — its HTTP route registrations are inert over the desktop carrier, and the row is what carries the connection browser half into the `__DSH_BOOT__` graph — and the [`dsh-client-connection`'s `/desktop` node half](../../client/connection/README.md) provides the `desktopBridge` host service (unary/respond fetch handler + mux/host event streams) the Electron main process wires to IPC. The shared module-reload HMR row stays disabled; client-plugin HMR in the desktop shell is a later milestone.

The runtime glue registers the harness-source prompt section (shared with the web runtime) and the `app:desktop-surface` section that orients sessions running inside the desktop shell — the web bundle's URL-based surface text is disabled because the shell has no server URL.

The `apps/desktop` shell loads the canonical `web` profile through `dsh-app-boot`, including its ordered bundles, profile-installed plugins, and `profiles/web/cordis.patch.yml`, then applies the home patch and the installation-owned `sdkwork-desktop-app` bundle as an in-memory transport overlay. The overlay is absent from the Web profile manifest, so `npx @deepseek-ai/dsh web` and Electron share one user composition while the Web launcher never receives desktop-only rows. A source-only composition parity test requires every Web row to remain present and unchanged except `webserver`, `web-runtime`, `client-hmr`, and `connection`, and fixes the complete desktop-only row set to `sdkwork-desktop-carrier`, `desktop-connection`, `sdkwork-desktop-app`, `window-controls`, and `update-banner`. The packaged-boot probe fetches every client bundle advertised by the installed `clientModules` graph, so a dependency omitted from the Electron package fails the release smoke.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

### Desktop-surface prompt section

#### What the model sees

For sessions created through the desktop shell, the `harness:source` section identifies the on-disk Harness implementation and the `app:desktop-surface` global section (order −98) orients the model to the Electron window: the "this window" referent, the absence of a server URL and browser, and the rebuild-and-reload client-plugin contract. The web bundle's URL-based `app:web-surface` section is disabled by the patch, so no URL or browser fact reaches the model.

#### Token effect

One source line and one prompt paragraph per session; constant per process.

#### KV Cache effect

The section sits near the system prompt's head and is stable for the life of the process, so it does not invalidate the cache across turns.

## Known Limitations and Deferred Work

- **No client-plugin HMR** — the shared HMR row is disabled; rebuilding and reloading the window is the current dev loop.
- **No remote access** — the desktop shell is intentionally zero-port; remote access is a later milestone.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The composition-parity test pins the complete desktop-only row set (`sdkwork-desktop-carrier`, `desktop-connection`, `sdkwork-desktop-app`, `window-controls`, `update-banner`) and the exact Web-row deltas, so adding or removing a bundle row must update that test in the same change. The packaged-boot probe fetches every client bundle the installed `clientModules` graph advertises, so a dependency missing from the Electron package surfaces only at release smoke.

</details>
