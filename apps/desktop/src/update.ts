/**
 * Auto-update discovery for the desktop shell: wraps electron-updater's
 * autoUpdater in a small state machine, reads the desktop settings namespace
 * (auto-check, channel, auto-download), and pushes every transition to the
 * renderer over `dsh:update-state`. Discovery and download ride the GitHub
 * Releases provider configured at build time (electron-builder.yml's
 * `publish` section); installation goes through the platform installer
 * (NSIS assisted, DMG/zip, AppImage).
 * @module @deepseek-ai/dsh-desktop/update
 */

import { shell, type BrowserWindow } from 'electron'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { IPC_CHANNELS, type DesktopUpdateState } from './bridge-types.ts'
import type { DesktopSettings, UpdateChannel } from './desktop-settings.ts'

/** The GitHub Releases page of the desktop shell's update source (the unsigned Phase A fallback). */
export const DESKTOP_RELEASE_PAGE_URL = 'https://github.com/sdkwork-ai/sdkwork-birdcoder2/releases'

/** How long after boot the first quiet check waits (startup traffic first). */
const DEFAULT_INITIAL_CHECK_DELAY_MS = 15_000

/** How often the updater re-checks while auto-check is on. */
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60_000

/** The update metadata the controller extracts from driver events. */
export interface UpdateReleaseInfo {
  version: string
  /** GitHub release title, when the provider reported one. */
  releaseName?: string
  /** GitHub release body markdown, when the provider reported one. */
  releaseNotes?: string
}

/** Download progress reported by the driver. */
export interface UpdateProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

/**
 * The driver surface the controller consumes — a structural mirror of the
 * electron-updater autoUpdater members used here, injectable for tests. The
 * real adapter (see {@link createElectronUpdaterDriver}) is the single place
 * that touches electron-updater's own types; payloads arrive untyped and the
 * controller casts them at this boundary per event.
 */
export interface UpdateDriver {
  /** Whether prerelease versions count as updates (channel policy). */
  allowPrerelease: boolean
  /** Whether the provider downloads immediately after discovery. */
  autoDownload: boolean
  /** Whether a downloaded update installs on an unrelated application quit. */
  autoInstallOnAppQuit: boolean
  on(event: string, listener: (payload?: unknown) => void): void
  off(event: string, listener: (payload?: unknown) => void): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

/** The electron-updater surface the adapter narrows to; its real `on` takes untyped handlers. */
interface ElectronUpdaterLike {
  allowPrerelease: boolean
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

/**
 * Build the real driver over electron-updater's autoUpdater singleton. Lazy:
 * electron-updater imports electron at module scope, which plain Node (vitest)
 * cannot load — only the packaged main process constructs it.
 * @returns the driver backed by the singleton.
 */
async function createElectronUpdaterDriver(): Promise<UpdateDriver> {
  const { autoUpdater } = await import('electron-updater')
  const updater = autoUpdater as unknown as ElectronUpdaterLike
  return {
    get allowPrerelease(): boolean { return updater.allowPrerelease },
    set allowPrerelease(value: boolean) { updater.allowPrerelease = value },
    get autoDownload(): boolean { return updater.autoDownload },
    set autoDownload(value: boolean) { updater.autoDownload = value },
    get autoInstallOnAppQuit(): boolean { return updater.autoInstallOnAppQuit },
    set autoInstallOnAppQuit(value: boolean) { updater.autoInstallOnAppQuit = value },
    on: (event: string, listener: (...args: unknown[]) => void) => { updater.on(event, listener) },
    off: (event: string, listener: (...args: unknown[]) => void) => { updater.removeListener(event, listener) },
    checkForUpdates: () => updater.checkForUpdates(),
    downloadUpdate: () => updater.downloadUpdate(),
    quitAndInstall: () => { updater.quitAndInstall() },
  }
}

/** Whether a semver string carries a prerelease segment (the 'follow' channel rule). */
export function isPrereleaseVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)/.test(version)
}

/**
 * Resolve the `allowPrerelease` flag for a channel: 'rc' always accepts
 * prereleases, 'stable' never does, and 'follow' mirrors the installed
 * version's own channel — an rc install keeps receiving rc updates until a
 * stable release lands, after which it follows stable only.
 * @param channel - the configured channel.
 * @param currentVersion - the installed app version.
 * @returns whether the driver should accept prerelease updates.
 */
export function resolveAllowPrerelease(channel: UpdateChannel, currentVersion: string): boolean {
  switch (channel) {
    case 'rc': return true
    case 'stable': return false
    case 'follow': return isPrereleaseVersion(currentVersion)
  }
}

/** Options for {@link installUpdater}. */
export interface InstallUpdaterOptions {
  /** The registered desktop settings scope; absent without a settings service. */
  settingsScope?: SettingsScope<DesktopSettings>
  /** The shell window (possibly undefined while it does not exist yet). */
  getWindow: () => BrowserWindow | undefined
  /** The installed app version (`app.getVersion()`). */
  currentVersion: string
  /** Whether the app runs packaged; dev runs never check. */
  isPackaged: boolean
  /** Whether this build can download and hand off its platform installer. */
  canInstall?: boolean
  /** Driver override for tests; defaults to the electron-updater autoUpdater. */
  driver?: UpdateDriver
  /** Release page opened on `openReleasePage`; defaults to {@link DESKTOP_RELEASE_PAGE_URL}. */
  releasePageUrl?: string
  /** First-check delay; defaults to {@link DEFAULT_INITIAL_CHECK_DELAY_MS}. */
  initialCheckDelayMs?: number
  /** Periodic check interval; defaults to {@link DEFAULT_CHECK_INTERVAL_MS}. */
  checkIntervalMs?: number
}

/** The installed updater surface the main process wires to IPC and the tray. */
export interface DesktopUpdater {
  /** Current update state; the renderer polls this once at startup. */
  getState(): DesktopUpdateState
  /** Quiet manual check; ignored unless the updater is idle. */
  checkNow(): Promise<void>
  /** Download the offered update; ignored unless one is available. */
  download(): Promise<void>
  /** Quit and run the downloaded installer; ignored unless one is ready. */
  install(): void
  /** Open the release page in the default browser (unsigned Phase A fallback). */
  openReleasePage(): void
  /** Stop timers and detach every listener. */
  dispose(): void
}

/**
 * Install the desktop auto-updater: wire the driver events into the update
 * state machine, observe the desktop settings scope, and schedule the initial
 * and periodic quiet checks. Every transition is pushed to the shell window.
 * @param options - wiring described on {@link InstallUpdaterOptions}.
 * @returns the updater surface.
 */
export function installUpdater(options: InstallUpdaterOptions): DesktopUpdater {
  const initialCheckDelayMs = options.initialCheckDelayMs ?? DEFAULT_INITIAL_CHECK_DELAY_MS
  const checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
  const releasePageUrl = options.releasePageUrl ?? DESKTOP_RELEASE_PAGE_URL
  const canInstall = options.canInstall ?? true

  let disposed = false
  let phase: DesktopUpdateState['phase'] = options.isPackaged ? 'idle' : 'disabled'
  let pending: UpdateReleaseInfo | undefined
  let progress: UpdateProgressInfo | undefined
  let lastError: string | undefined
  let autoDownload = false

  // The resolved scope carries the schema defaults, so an absent scope is the
  // only path that needs its own defaults. `channel` is the live copy the
  // watch below keeps current for the first driver init.
  const prefs: DesktopSettings = options.settingsScope?.get() ?? {
    closeToTray: true, autoCheckUpdates: true, updateChannel: 'follow', autoDownload: false,
  }
  let channel = prefs.updateChannel
  autoDownload = prefs.autoDownload

  const stateOf = (): DesktopUpdateState => ({
    phase,
    canInstall,
    ...(pending === undefined ? {} : {
      version: pending.version, releaseName: pending.releaseName, releaseNotes: pending.releaseNotes,
    }),
    ...(phase === 'downloading' && progress !== undefined ? { progress } : {}),
    ...(lastError === undefined ? {} : { error: lastError }),
  })

  const pushState = (): void => {
    const win = options.getWindow()
    if (win === undefined || win.isDestroyed()) return
    win.webContents.send(IPC_CHANNELS.updateState, stateOf())
  }

  const goChecking = (): void => {
    phase = 'checking'
    lastError = undefined
    pushState()
  }
  const goAvailable = (info: UpdateReleaseInfo): void => {
    pending = info
    progress = undefined
    lastError = undefined
    phase = 'available'
    pushState()
  }
  const goNotAvailable = (): void => {
    pending = undefined
    progress = undefined
    lastError = undefined
    phase = 'idle'
    pushState()
  }
  const goProgress = (next: UpdateProgressInfo): void => {
    progress = next
    phase = 'downloading'
    pushState()
  }
  const goDownloaded = (info: UpdateReleaseInfo): void => {
    pending = info
    progress = undefined
    phase = 'downloaded'
    pushState()
  }
  const goInstalling = (): void => {
    phase = 'installing'
    pushState()
  }
  const goError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error)
    lastError = message
    // A download failure returns to the offer so the banner can retry; a
    // check failure with nothing offered returns to idle (the settings row
    // surfaces the error text).
    phase = pending === undefined ? 'idle' : 'available'
    pushState()
  }

  // Driver wiring: listeners attach exactly once, at the first use (the lazy
  // import cannot run under plain Node, so tests inject a driver instead).
  let driverPromise: Promise<UpdateDriver> | undefined
  const attached = new Set<{ event: string; listener: (payload?: unknown) => void }>()
  const attachDriver = (driver: UpdateDriver): void => {
    const registrations: Array<[string, (payload?: unknown) => void]> = [
      ['checking-for-update', () => { goChecking() }],
      ['update-available', (payload) => {
        goAvailable(payload as UpdateReleaseInfo)
        // The auto-download preference: the offer transitions to a download
        // without waiting for the user's prompt.
        if (canInstall && autoDownload) void download()
      }],
      ['update-not-available', () => { goNotAvailable() }],
      ['download-progress', (payload) => { goProgress(payload as UpdateProgressInfo) }],
      ['update-downloaded', (payload) => { goDownloaded(payload as UpdateReleaseInfo) }],
      ['error', (payload) => { goError(payload) }],
    ]
    for (const [event, listener] of registrations) {
      driver.on(event, listener)
      attached.add({ event, listener })
    }
  }
  const detachDriver = (driver: UpdateDriver): void => {
    for (const { event, listener } of attached) driver.off(event, listener)
    attached.clear()
  }
  const initDriver = (): Promise<UpdateDriver> => {
    driverPromise ??= Promise.resolve(options.driver ?? createElectronUpdaterDriver())
      .then((driver) => {
        attachDriver(driver)
        driver.autoDownload = false
        driver.autoInstallOnAppQuit = false
        driver.allowPrerelease = resolveAllowPrerelease(channel, options.currentVersion)
        return driver
      })
    return driverPromise
  }

  const checkNow = async (): Promise<void> => {
    if (disposed || phase !== 'idle') return
    goChecking()
    try {
      const driver = await initDriver()
      await driver.checkForUpdates()
    } catch (error) {
      // The driver reports its own failures through the 'error' event; only a
      // failure to construct/init the driver (never a check result) reaches
      // this catch and transitions here.
      goError(error)
    }
  }

  const download = async (): Promise<void> => {
    if (disposed || !canInstall || phase !== 'available' || pending === undefined) return
    phase = 'downloading'
    progress = undefined
    lastError = undefined
    pushState()
    try {
      const driver = await initDriver()
      await driver.downloadUpdate()
    } catch (error) {
      goError(error)
    }
  }

  const install = (): void => {
    if (disposed || !canInstall || phase !== 'downloaded') return
    goInstalling()
    // The NSIS updater spawns the installer detached before quitting, so the
    // shell's own before-quit shutdown (host dispose, then exit) runs under
    // it without blocking the install.
    void initDriver().then((driver) => { driver.quitAndInstall() }).catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error)
      phase = 'downloaded'
      pushState()
      console.error('dsh-desktop: update install unavailable:', error)
    })
  }

  const openReleasePage = (): void => {
    void shell.openExternal(releasePageUrl).catch((error: unknown) => {
      console.error('dsh-desktop: open release page failed:', error)
    })
  }

  let initialTimer: ReturnType<typeof setTimeout> | undefined
  let intervalTimer: ReturnType<typeof setInterval> | undefined
  const stopAutoCheck = (): void => {
    if (initialTimer !== undefined) { clearTimeout(initialTimer); initialTimer = undefined }
    if (intervalTimer !== undefined) { clearInterval(intervalTimer); intervalTimer = undefined }
  }
  const startAutoCheck = (): void => {
    stopAutoCheck()
    if (!options.isPackaged) return
    initialTimer = setTimeout(() => { void checkNow() }, initialCheckDelayMs)
    intervalTimer = setInterval(() => { void checkNow() }, checkIntervalMs)
  }

  const applyPrefs = (next: DesktopSettings): void => {
    channel = next.updateChannel
    autoDownload = next.autoDownload
    if (driverPromise !== undefined) {
      void driverPromise.then((driver) => { driver.allowPrerelease = resolveAllowPrerelease(channel, options.currentVersion) })
    }
    if (next.autoCheckUpdates) startAutoCheck()
    else stopAutoCheck()
  }

  const unwatchSettings = options.settingsScope?.watch((next) => {
    if (disposed) return
    applyPrefs(next)
  })
  applyPrefs(prefs)

  return {
    getState: stateOf,
    checkNow,
    download,
    install,
    openReleasePage,
    dispose: () => {
      if (disposed) return
      disposed = true
      stopAutoCheck()
      unwatchSettings?.()
      if (driverPromise !== undefined) {
        void driverPromise.then(detachDriver)
      }
    },
  }
}
