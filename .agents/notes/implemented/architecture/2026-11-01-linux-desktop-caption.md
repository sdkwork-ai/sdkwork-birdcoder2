# Agent Note: Linux draws the product caption instead of stacking a second header

Status: implemented

English | [中文](2026-11-01-linux-desktop-caption.zh.md)

## Problem

The desktop shell shipped three window-chrome arrangements. Windows replaced the OS frame with a 40-DIP caption band plus a native titlebar overlay; macOS kept `hiddenInset` traffic lights beside its vibrancy sidebar; Linux kept the OS frame, Electron's own application menu, and the page. On Ubuntu the Linux arrangement renders two headers: the window manager's title bar, then Electron's localized `Application`/`Edit` row, then the page. The native row is painted from the GTK theme rather than from the application palette, so a dark application theme still shows a light band between the title bar and the sidebar. The product wants the Windows arrangement — toggle and menus inside one caption band, native window controls at its right edge — on Linux as well.

## Decision

- `apps/desktop/src/caption-platform.ts` owns the gate: `usesProductCaption(platform)` is true for `win32` and `linux`. Every main-process and preload decision about the caption reads that gate, so the two platforms cannot drift apart again.
- The main window takes `titleBarStyle: 'hidden'` with `titleBarOverlay` on a caption platform. Linux additionally takes a `backgroundColor` from the shell's palette fallback, and the appearance report repaints the window base with the measured caption fill, so a resize or reload gap shows the application palette instead of Electron's white default.
- `Menu.setApplicationMenu` registers only hidden shortcut rows on a caption platform. No native menu row is left for the window manager or for Alt to reveal; the caption's `Application` and `Edit` entries open the same native popup menus, whose IPC handlers now accept Linux senders too.
- The application preload publishes the upstream `data-windows-titlebar` marker and the 40 px height token on both platforms, mounts the caption menubar, and reports measured caption and symbol colors. The marker keeps upstream's Windows-flavoured name because upstream's layout, sidebar, dockkit, and settings sheets key every caption rule off it; a second fork-owned attribute would fork all of those rules at once.
- Fullscreen transitions and the state after each page load relay on every caption platform, so the shell drops the caption clearance when the native controls disappear. Embedded update documents inset below the caption band on both platforms.
- macOS is untouched: it keeps `hiddenInset`, its traffic lights, and its native menu row.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Keep the OS frame and remove only Electron's menu row | The window returns to one header, but the product's Application and Edit entries vanish from its chrome and the OS still paints the title in the GTK theme |
| Keep the native frame and move the menus into the page | The caption entries belong in the window's chrome, not in a page that any surface can cover |
| Rename the marker to a platform-neutral attribute | Dozens of upstream CSS rules and their specs assert `data-windows-titlebar`; the rename would fork all of them and every later upstream change to them |
| Draw custom web window controls on Linux | The native overlay keeps OS interactions (snap, double-click maximize, accessibility) and needs no new IPC or glyph set |

## Consequences

A Linux window now shows exactly the Windows caption: the sidebar toggle and the localized `Application`/`Edit` entries at the left of one 40-DIP band, native window controls at its right, and the band painted from the application palette in both themes. The `data-windows-titlebar` marker also makes the caption row the Linux window's drag surface, so window dragging and double-click maximize follow the same CSS as Windows. The fixed-size welcome window keeps the OS frame; it shares the application menu, which now registers no visible row, so it shows one title bar instead of a title plus a menu row.

Costs and limits: the Linux window now depends on Electron's Linux titlebar overlay rather than on the window manager's own decorations; a palette change repaints the window base through the appearance report; the caption marker keeps a Windows-flavoured name; the automated lane covers the platform gate, window options, menu template, fullscreen relay, popup menus, and appearance sync, while the GTK-drawn controls themselves stay a manual check on a real desktop.

## Verification

```sh
pnpm exec vitest run apps/desktop/tests/caption-platform.spec.ts apps/desktop/tests/main-startup.spec.ts \
  apps/desktop/tests/preload-windows.client.spec.ts apps/desktop/tests/preload-platform.client.spec.ts \
  apps/desktop/tests/update-overlay.spec.ts
grep -rn "process.platform === 'win32'" apps/desktop/src/preload-windows.ts apps/desktop/src/preload-platform.ts  # nothing: both read the gate
```
