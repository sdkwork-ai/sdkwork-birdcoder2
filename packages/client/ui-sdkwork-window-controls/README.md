---
description: "Desktop window controls for the frameless Electron shell: a custom minimize/maximize-restore/close cluster plus tray routing and the close-to-tray preference row, shipping only in the dsh-desktop-app bundle."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-window-controls

English | [中文](README.zh.md)

## Summary


Desktop window controls for the frameless Electron shell: a custom minimize / maximize-restore / close cluster drawn entirely in HTML and CSS (inline SVG glyphs, no icon or windowing library). Two registrations coordinate one interactive cluster. The `shell.overlay` occupant pins that cluster to the frame's top-right across the new-session hero, Session header, and details-panel states. The `conversation.session.header.utilities` occupant reserves the same platform footprint after the Session-log utility without mounting another set of buttons. Details-column width therefore cannot move the controls, and the header utilities remain clear of the overlay. The details header consumes the overlay's `--dsh-window-controls-details-right` inset so its close action also stays clear.

Platform metrics are explicit: Windows uses 45x32px full-bleed hit targets with a 12px glyph; Linux uses 34px GNOME-style controls with 16px symbolic glyphs, 3px spacing, a 6px top inset, and a 7px trailing inset; macOS uses 28px compact controls with a 12px glyph and 12px top/trailing insets; unknown hosts use the compact 12px glyph and 8px insets. The right-side placement is product-owned; native macOS traffic lights and zoom semantics remain outside this Windows-first UI.

The cluster is pure presentation over the preload's `windowControls` surface (`window.desktopBridge.windowControls`, an optional member of the authoritative `DesktopBridge` in `dsh-client-connection`). One-shot actions ride fire-and-forget sends; the initial toggle glyph is seeded from an `isMaximized()` query and kept current by the `onMaximizedChanged` subscription, so a keyboard snap or a double-click on the drag region flips the glyph without a stale render. Absent the surface — the web composition, fixture mode, or an accidental roster — the components render nothing.

The plugin is the desktop shell's chrome surface beyond the cluster: it routes the system tray's session commands into the renderer (the tray menu lists the whole host corpus, so `onOpenSession` repulls the session baseline via `sessions.refresh()` before `sessions.open()` when the id is not in the list mirror, and `onNewSession` rides `workspaces.startSession()`), and it owns the close-to-tray preference row in General settings (`settings.general.item`, id `desktop-tray`), bound to the `desktop` settings namespace through `ctx.settingsScope`. The host-side namespace registration and the tray itself live in the app's main process ([desktop tray Agent Note](../../../.agents/notes/implemented/feature/2026-08-15-desktop-tray-background-mode.md)); `refresh()` joined the `ISessions` face ([runtime contract](../runtime/src/client/contract/sessions.ts)) for this path.

The shell itself is frameless (`frame: false`) with no application menu. The Session header title row is the window drag region (`-webkit-app-region: drag`, inert on the web), and the cluster opts back into pointer events; the overlay strip carries its own drag region. Double-clicking either drag region maximizes and restores natively. The package ships only in the `dsh-desktop-app` bundle patch, so the web composition never loads it. The [frameless window chrome Agent Note](../../../.agents/notes/implemented/architecture/2026-08-14-desktop-frameless-window-chrome.md) owns the main-process side of the window-chrome contract (channels, preload, drag regions).

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Model Experience

None, as the package is human-only desktop chrome and navigation. Tray actions may select or create a session, but they do not submit a message, add a session event, or change a model request.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Windows-first framing** — the right-side custom cluster follows Windows placement. It does not reproduce native macOS traffic lights, and platform-specific zoom semantics remain outside the package.
- **No Windows 11 snap-layout flyout** — the native maximize button (which hosts the flyout) is gone with the title bar; snapping still works via drag-to-top, Win+arrow keys, and the custom maximize button.
- **Drag region follows the header** — only the Session header row and the overlay strip are draggable; the sidebar, details column, and hero body are not (the header row's buttons and the cluster stay clickable via `no-drag`).

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Two registrations coordinate one cluster: the `shell.overlay` occupant pins the buttons and the `conversation.session.header.utilities` occupant only reserves the platform footprint — mounting a second interactive set double-renders the chrome. The package ships only in the `dsh-desktop-app` bundle and renders nothing without the preload's `windowControls` surface, and the [frameless window chrome Agent Note](../../../.agents/notes/implemented/architecture/2026-08-14-desktop-frameless-window-chrome.md) owns the main-process side of the contract.

</details>
