/**
 * The desktop shell's About command bridge.
 *
 * The application menu's About entry (Windows, Linux, and macOS alike) opens the
 * web client's About dialog instead of a native message box: only the page knows
 * the deployment profile (access token, gateway origin) and the client build
 * version, and only the page can render the product's own About surface. This
 * module owns the two channels behind that hand-off:
 *
 * - `sdkwork:about:open` is a main-to-renderer event announcing the command;
 * - `sdkwork:about:takePending` lets a page that mounted after the click — or
 *   was still booting when the menu item ran — consume the request once.
 *
 * The renderer side is exposed through the same `window.sdkworkDesktop` bridge
 * as the IAM deep links (`iam-preload.ts`), so a page has one SDKWork preload
 * surface rather than one per feature.
 */

import type { IpcMain, IpcMainInvokeEvent } from 'electron'

/** About command channels; keep in step with `iam-preload.ts`'s exposed slice. */
export const ABOUT_BRIDGE = {
  openEvent: 'sdkwork:about:open',
  takePending: 'sdkwork:about:takePending',
  facts: 'sdkwork:about:facts',
} as const

/** Shell facts the About surface may show when the page build carries none. */
export interface AboutShellFacts {
  /** Installed application version (`app.getVersion()`). */
  readonly appVersion: string
}

/**
 * Window surface the command needs.
 *
 * Narrowed from `BrowserWindow` so the command's tests drive it without a real
 * Electron window; the shell passes the main window directly.
 */
export interface AboutCommandWindow {
  /** Renderer channel target. */
  readonly webContents: { send(channel: string, ...args: unknown[]): void }
  /** Whether the window was closed. */
  isDestroyed(): boolean
  /** Whether the window is minimized. */
  isMinimized(): boolean
  /** Restore a minimized window before showing the dialog. */
  restore(): void
  /** Show a hidden window. */
  show(): void
  /** Bring the window to the foreground. */
  focus(): void
}

/** Electron surface the main-process command needs. */
export interface AboutBridgeOptions {
  ipcMain: Pick<IpcMain, 'handle'> & Partial<Pick<IpcMain, 'removeHandler'>>
  /** Window the command hands the request to; undefined before it exists. */
  getWindow: () => AboutCommandWindow | undefined
  /** Reject a bridge call from a frame this application does not own. */
  assertSender: (event: IpcMainInvokeEvent) => void
  /** Installed application version the About surface may fall back to. */
  appVersion: () => string
}

/** One main-process About command instance. */
export interface AboutCommand {
  /**
   * Open the in-app About dialog: focus the workspace window and announce the
   * command. A page that is not listening yet receives the request through
   * {@link AboutCommand.takePending} on mount.
   */
  show(): void
  /** Whether a command was issued before the page could listen (consumes it). */
  takePending(): boolean
  /** Detach the IPC handler. */
  dispose(): void
}

/**
 * Wire the About command to the application menu.
 * @param options - Electron surfaces, the window resolver, and the sender guard.
 * @returns the command handle.
 */
export function createAboutCommand(options: AboutBridgeOptions): AboutCommand {
  let pending = false
  const take = (): boolean => {
    const value = pending
    pending = false
    return value
  }
  options.ipcMain.handle(ABOUT_BRIDGE.takePending, (event) => {
    options.assertSender(event)
    return take()
  })
  options.ipcMain.handle(ABOUT_BRIDGE.facts, (event): AboutShellFacts => {
    options.assertSender(event)
    return { appVersion: options.appVersion() }
  })
  return {
    show: () => {
      const window = options.getWindow()
      if (window === undefined || window.isDestroyed()) {
        // The command has no surface to open yet; the page will ask for it on
        // mount through `takePending`.
        pending = true
        return
      }
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
      pending = true
      window.webContents.send(ABOUT_BRIDGE.openEvent)
    },
    takePending: take,
    dispose: () => {
      options.ipcMain.removeHandler?.(ABOUT_BRIDGE.takePending)
      options.ipcMain.removeHandler?.(ABOUT_BRIDGE.facts)
    },
  }
}
