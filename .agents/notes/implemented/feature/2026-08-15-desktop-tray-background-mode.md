# Agent Note: The desktop system tray — background mode, session quick-jump, and close-to-tray

Status: implemented

English | [中文](2026-08-15-desktop-tray-background-mode.zh.md)

## Problem

The desktop shell quit when the window closed: the harness host — which may be running agents in the background — died with the window, and the only way to reach a session was to open the full shell. The request was a background process mode: a system tray icon (taskbar notification area on Windows, menu bar on macOS, AppIndicator/StatusNotifier on Linux) that opens the app on click, a right-click menu listing recent sessions for quick jumps, and platform-native behavior aligned with professional tray products.

## Decision

The desktop shell runs in the background and exposes a system tray with a session menu, owned by the app's main process:

- **`apps/desktop/src/tray.ts`** — `installTray()` creates the `Tray` from the shipped `build/icon.png` (resized to 18x18 on macOS), sets the tooltip, consumes the live `desktop` settings namespace, reads recent sessions from `ctx.sessionQuery` (`listSessions()` + `readTitleSnapshots()`, filtering subagent children and untitled/blank sessions before capping at 8), and builds the menu template: Open / New Session / recent sessions with relative-time sublabels / Check for Updates / Quit. Platform wiring follows each OS's convention: macOS and Linux open the menu on click (macOS pops it fresh per click; Linux sets the static context menu and refreshes it on window focus/show plus a 30s interval, because AppIndicator delivers no click events), while Windows and other platforms show the window on left/double click and pop the fresh menu on right click.
- **Background mode in `apps/desktop/src/main.ts`** — the window's `close` event hides it to the tray instead of closing while close-to-tray is on and no quit is in progress; `window-all-closed` no longer quits while background mode is active (macOS apps also stay alive by convention); `second-instance` and macOS `activate` show the hidden window. The tray's Quit item sets a quitting flag and calls `app.quit()`, which runs the existing dispose-then-exit shutdown.
- **Tray → renderer navigation over IPC** — two new one-way channels, `dsh:open-session` (`{ sessionId }`) and `dsh:new-session`, pushed from the main process before showing the window; the preload exposes `onOpenSession(listener)` / `onNewSession(listener)` on the authoritative `DesktopBridge` in `dsh-client-connection` (mirrored structurally in the app's `bridge-types.ts`).
- **The client plugin** (`packages/client/ui-sdkwork-window-controls`, the desktop shell's chrome plugin) now also routes tray navigation: `onOpenSession` opens the listed session — repulling the baseline via `sessions.refresh()` first when the id is not in the renderer's list mirror, because the tray lists the whole host corpus — and `onNewSession` rides the shared `workspaces.startSession()` action. The same plugin registers the close-to-tray preference row into General settings (`settings.general.item`, id `desktop-tray`), bound to the `desktop` settings namespace through `ctx.settingsScope`; the host-side registration lives with the tray in the main process.
- **`ISessions` widening** — `refresh(): Promise<void>` joins the outward sessions face (`dsh-client-runtime`), implemented by `SessionRuntime` and the fixture `TestSessions` double; the tray's open-session path is the current consumer.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Serving the menu from the host's `/api/session.list` RPC through the bridge | `ctx.sessionQuery` is the same live-preferred corpus with a direct, type-checked call from the process that owns the host tree; no wire envelope to build or parse |
| `setContextMenu` on every platform | macOS and Windows then cannot pop a freshly built menu per interaction; popup-per-click keeps sessions current without refresh machinery, and Linux (the one platform that requires the set menu) gets an explicit refresh path |
| A new client plugin package for tray navigation | The desktop shell's chrome plugin already owns the preload surface; a 30-line listener does not justify a new package skeleton and bundle registration |
| Persisting close-to-tray in an Electron `userData` JSON file | The product's settings capability (`ctx.settings` + the General settings surface) already persists user preferences and surfaces them in the UI |

## Consequences

Closing the window keeps the harness running in the background by default (the tray tooltip and icon make it discoverable), and the tray menu jumps straight into a session or starts a new one without opening the window first. The web GUI is untouched: the new IPC channels are no-ops outside the desktop preload, the plugin's tray routing guards on the bridge surface, and the settings row binds a namespace only the desktop shell registers. Costs: an always-running Linux 30s refresh interval rebuilds a menu of at most ~13 items (negligible); the tray session list is ordered by creation time (the corpus order), not last activity; close-to-tray is on by default, so a user who closes the window must quit from the tray, Cmd/Ctrl+Q, or the settings toggle; the packaged app must be rebuilt for the new main-process and client bundles.

## Testing

`apps/desktop/tests/tray.spec.ts` covers the menu template and actions, update callback wiring, session loading (subagent/untitled filtering before the cap), the settings schema default and live observation, and the per-platform click wiring with a mocked `Tray`/`Menu`/`nativeImage`. `packages/client/ui-sdkwork-window-controls` covers the tray routing (listed/unknown/absent-id paths, teardown) and the settings row (store mirror, write routing, scope states) at the per-file 100% gate; `TestSessions.refresh()` is pinned by the test-support runtime spec.
