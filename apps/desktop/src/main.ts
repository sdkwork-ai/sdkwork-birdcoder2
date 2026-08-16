/**
 * The desktop shell's Electron entry: single-instance lock, scheme
 * registration, host boot, protocol + IPC wiring, window creation, and
 * ordered shutdown (dispose the host tree before exit).
 * @module @deepseek-ai/dsh-desktop
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu } from 'electron'
import type { DesktopWebServer } from '@deepseek-ai/dsh-host-desktop-carrier'
import { bootDesktopHost } from './host.ts'
import { IPC_CHANNELS } from './bridge-types.ts'
import { registerIpc, registerUpdateIpc, registerWindowIpc } from './ipc.ts'
import { APP_INDEX_URL, registerAppScheme, registerDesktopProtocol } from './protocol.ts'
import { installTray, type DesktopTray } from './tray.ts'
import type { DesktopBridgeHost } from './bridge-types.ts'
import { registerDesktopSettings } from './desktop-settings.ts'
import { DESKTOP_RELEASE_PAGE_URL, installUpdater } from './update.ts'

/** The CJS preload artifact (sandboxed preloads cannot be ESM), beside lib/main.js. */
const PRELOAD_PATH = fileURLToPath(new URL('./preload.cjs', import.meta.url))

/** The app icon (generated from assets/birdcoder2-appicon.png), used for the window on Windows/Linux. */
const WINDOW_ICON = join(app.getAppPath(), 'build', 'icon.png')

let window: BrowserWindow | undefined
let tray: DesktopTray | undefined
let disposing = false
let quitting = false

/**
 * Show and focus the shell window, restoring it from a hidden (tray) or
 * minimized state — the shared "open the app" action behind the tray menu,
 * dock activation, and second-instance launches.
 */
function showShellWindow(): void {
  if (window === undefined || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
}

/**
 * Boot the host and open the shell window.
 */
async function start(): Promise<void> {
  // The installation anchor is the app's own package.json: `app.getAppPath()`
  // is apps/desktop in dev and resources/app in the packaged build, so the
  // module fallback heals against the real installation in both layouts.
  const { ctx, shutdown } = await bootDesktopHost({
    installAnchor: join(app.getAppPath(), 'package.json'),
  })
  const carrier = ctx.get('webServer') as DesktopWebServer | undefined
  if (carrier === undefined) throw new Error('dsh-desktop: webServer service missing after boot')
  const bridge = ctx.get('desktopBridge') as DesktopBridgeHost | undefined
  if (bridge === undefined) throw new Error('dsh-desktop: desktopBridge service missing after boot')

  // The desktop settings namespace: registered exactly once, consumed by the
  // tray (close-to-tray) and the updater (auto-check/channel/auto-download).
  const settingsScope = registerDesktopSettings(ctx)

  registerDesktopProtocol(carrier)
  registerIpc(bridge)
  registerWindowIpc()

  // Ordered quit: prevent the default, dispose the host tree (bounded by the
  // shutdown controller's timeout), then exit for real.
  app.on('before-quit', (event) => {
    if (disposing) return
    disposing = true
    event.preventDefault()
    void shutdown.shutdown(0).then(() => { app.exit(0) })
  })

  // No default application menu (the shell is frameless; the custom title-bar
  // chrome owns window control) and no native title bar — the renderer draws
  // its own drag region and window controls.
  Menu.setApplicationMenu(null)
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'BirdCoder',
    icon: WINDOW_ICON,
    frame: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Close-to-tray background mode: while the preference is on (the default),
  // closing the window hides it to the tray and the host keeps running; the
  // tray's Quit item and Cmd/Ctrl+Q are the real exits.
  window.on('close', (event) => {
    if (quitting || tray?.closeToTray() !== true) return
    event.preventDefault()
    window?.hide()
  })
  window.on('closed', () => { window = undefined })
  // Push maximize/restore flips to the custom controls so the toggle glyph
  // tracks the real window state (keyboard snap, double-click drag region).
  const forwardMaximizeState = (): void => {
    if (window !== undefined && !window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.windowMaximized, window.isMaximized())
    }
  }
  window.on('maximize', forwardMaximizeState)
  window.on('unmaximize', forwardMaximizeState)
  // Renderer crashes (a GPU/utility fault, an out-of-memory kill) blank the
  // shell; the host tree lives in this process, so reloading the page restores
  // the UI over the same sessions. Clean exits (window close, our own quit)
  // never reach this branch.
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`dsh-desktop: renderer gone (${details.reason}${details.exitCode !== 0 ? `, exit ${details.exitCode}` : ''}) — reloading the shell`)
    if (window !== undefined && !window.isDestroyed()) {
      window.webContents.reload()
    }
  })

  // Auto-update discovery: the GitHub Releases provider configured at build
  // time (electron-builder.yml's publish section). Quiet checks on boot and on
  // an interval, transitions pushed to the renderer's update banner; dev runs
  // are disabled (nothing is packaged to replace). Installation needs a signed
  // build, so until the signing milestone the banner's fallback opens the
  // release page for a manual download.
  const updater = installUpdater({
    ...(settingsScope === undefined ? {} : { settingsScope }),
    getWindow: () => window,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    // macOS requires a signed application for electron-updater installer
    // handoff. Unsigned release candidates keep discovery and the Release-page
    // path without exposing a download action that the OS will reject.
    canInstall: process.platform !== 'darwin',
    releasePageUrl: DESKTOP_RELEASE_PAGE_URL,
  })
  registerUpdateIpc(updater)

  // The preload calls update state during renderer startup. Register its IPC
  // handlers before loading the page so the first request cannot race setup.
  await window.loadURL(APP_INDEX_URL)

  // The system tray: the background-mode surface and the session quick-jump
  // menu. Installed after the window loads so renderer commands always have a
  // live page to land on.
  tray = installTray({
    ctx,
    getWindow: () => window,
    quit: () => {
      quitting = true
      app.quit()
    },
    iconPath: WINDOW_ICON,
    ...(settingsScope === undefined ? {} : { settingsScope }),
    checkUpdates: () => { void updater.checkNow() },
  })
}

// Diagnose background-process faults (GPU compositor, utility, zygote): a GPU
// crash can freeze the window while Electron restarts it, and the log is the
// only record after the fact.
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' || details.type === 'Utility') {
    console.error(`dsh-desktop: ${details.type} process gone (${details.reason}${details.exitCode !== 0 ? `, exit ${details.exitCode}` : ''})`)
  }
})

registerAppScheme()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // A second launch opens the existing shell — the tray app's foreground
    // gesture, whether the window is hidden in the tray or merely unfocused.
    showShellWindow()
  })
  // macOS dock activation with no visible window restores the shell (the
  // window is hidden in the tray, never destroyed, while close-to-tray is on).
  app.on('activate', () => {
    showShellWindow()
  })
  void app.whenReady().then(() => {
    void start().catch((error: unknown) => {
      console.error('dsh-desktop: startup failed:', error)
      app.exit(1)
    })
  })
}

app.on('window-all-closed', () => {
  // Background mode: with close-to-tray on, window close hides (never closes),
  // so this fires only when the window was really destroyed while the tray
  // keeps the host alive — stay running and reopen from the tray. macOS apps
  // also conventionally stay alive without windows. Otherwise (close-to-tray
  // off) closing the window quits, as before the tray existed.
  if (tray?.closeToTray() === true || process.platform === 'darwin') return
  app.quit()
})
