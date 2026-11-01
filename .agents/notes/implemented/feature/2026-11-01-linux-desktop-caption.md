# Agent Note: Linux desktop caption

Status: implemented

English | [中文](2026-11-01-linux-desktop-caption.zh.md)

## Problem

The Ubuntu/Linux desktop main window drew two headers. The window was framed, so GTK painted its title bar with the application name and minimize/maximize/close, and the shared application menu was a visible native menu, so a second row of Application and Edit commands sat below it. Windows had already collapsed that into one header: a hidden native title bar, Electron's Window Controls Overlay for the native minimize/maximize/close buttons, and the shared 40-DIP in-page caption row (sidebar toggle/brand, localized Application and Edit entries, drag region) that the desktop preload publishes through the shared layout's `data-windows-titlebar` marker. Linux spent an extra title bar and menu row on every window, and its menu language and command set could differ from the caption beside it.

## Decision

### Linux joins the caption platforms

`desktopCaptionPlatform()` in `apps/desktop/src/main.ts` returns true for `win32` and `linux`. `createWindow()` gives the primary window `titleBarStyle: 'hidden'` and a 40-DIP `titleBarOverlay` with palette-synced colors on both platforms, so Electron draws the native minimize/maximize/close buttons over the page. `apps/desktop/src/preload-windows.ts` publishes the `data-windows-titlebar` marker and `--dsh-windows-titlebar-height` on Linux too, which is what makes the shared client layout reserve the caption row; `apps/desktop/src/preload-menu.ts` mounts the localized Application and Edit entries in the same isolated shadow root.

The names stay upstream's. The fork keeps `data-windows-titlebar`, the `--dsh-windows-*` CSS variables, and the Windows-named caption CSS in `packages/client` unchanged and only widens the platforms that publish the marker (`preload-windows.ts`); the name is the shared historical name, not a platform check. No client package changes.

### The Linux application menu becomes invisible and accelerator-only

As on Windows, `main.ts` installs a hidden `toggleDevTools` entry plus the hidden F12 alias instead of the visible Application/Edit menu, so no native menu row draws above the window. The caption's Application and Edit entries replace it: the main process handles `dsh-desktop:windows-menu` on both caption platforms and opens the native popup menus anchored at the caption entry, and Edit forwards undo, redo, cut, copy, paste, delete, and select all to the focused editor as keys.

Caption popup colors sync through the same `dsh-desktop:windows-appearance` → `setTitleBarOverlay` path on Linux. Fullscreen transitions are relayed to the renderer on Linux too (`main.ts` and `apps/desktop/src/preload-platform.ts`), so the shared layout drops caption clearance where the native buttons disappear.

### Framed and isolated surfaces clear the caption

The Linux Welcome window remains natively framed — its single header is the GTK title bar — but a framed window still draws the shared hidden application menu as an empty native menu row. `openWelcomeWindow()` calls `window.setMenu(null)` on Linux so no second header appears. Isolated update and mandatory-update overlay views start at `WINDOWS_TITLEBAR_HEIGHT` (40 DIP) on Linux as on Windows (`apps/desktop/src/update-overlay.ts`), leaving the caption and its menus operable above them.

Linux context-menu role labels are localized by the same caption-platform condition as Windows, and the caption Application menu's Quit entry uses the localized `quitApplication` label on Linux (`exitApplication` remains Windows' label).

## Alternatives considered

**Keep the Linux native menu and only hide it.** It is the smallest change: auto-hide the menu row and reveal it with Alt. It still leaves a second header behind a keyboard convention, and the caption already carries the same commands, so the Linux window would keep a header the other caption platforms do not have. The fork removes the row instead.

**Delete or rename upstream's `data-windows-titlebar` marker and `--dsh-windows-*` variables.** A Linux-named marker and variables would read more honestly, but they live in upstream-owned shared client CSS and layout, so the fork would carry a large rename diff that every upstream merge re-resolves and can regress. Reusing the historical name keeps the merge surface to the platform condition in the desktop preload; client packages are untouched.

**Draw custom HTML window controls instead of the native Window Controls Overlay.** Custom controls would let the caption style the buttons, but they reimplement native caption interactions (drag, double-click maximize, snapping, system menu, accessibility) that Windows already chose the native overlay for. The desktop shell keeps the native overlay and draws only the in-page row.

**Make the Linux Welcome window frameless too.** A frameless welcome window would remove its native title bar, but that is more surface than the reported main-window bug, and the fixed-size welcome window gains nothing from an overlay; removing its empty menu row already leaves one header.

**Leave the isolated update overlay at top 0.** The overlay views would cover the caption on Linux and make its menus unreachable while an update prompt or mandatory policy is up; offsetting them by the caption height is the Windows behavior, applied to Linux.

## Consequences

Ubuntu/Linux shows one header on the main window: the in-page 40-DIP caption with the native controls at its right. The GTK title bar and the native application-menu row are gone. Native minimize/maximize/close keep operating-system behavior because Electron still supplies them. The Linux Welcome window keeps one native title bar and loses its empty menu row. Caption colors follow the application palette, and Linux context-menu labels and the caption Quit label follow the shell language. The cost is a Linux dependency on Electron's Window Controls Overlay support and a shared marker name (`data-windows-titlebar`) that is historical rather than literal; a future upstream change to that marker or the caption CSS reaches Linux through the same shared code.

## Testing

`pnpm exec vitest run apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/preload-windows.client.spec.ts apps/desktop/tests/preload-platform.client.spec.ts apps/desktop/tests/update-overlay.spec.ts apps/desktop/tests/welcome-window.spec.ts` covers the per-platform window options (hidden titlebar plus 40-DIP overlay on `win32`/`linux`, `hiddenInset` on `darwin`), the invisible accelerator-only application menu on both caption platforms, localized caption popups, palette IPC and context-menu labels on Linux, the Linux fullscreen relay, the caption marker on `win32`/`linux`, the overlay's 40-DIP top offset, and `setMenu(null)` on the Linux Welcome window only.
