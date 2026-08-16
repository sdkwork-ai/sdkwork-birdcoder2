/**
 * System-tray integration for the desktop shell: the background-process
 * surface (close-to-tray), the tray icon with platform-native click behavior,
 * and the right-click menu — Open, New Session, recent sessions with titles,
 * a manual update check, and Quit. The host tree lives in this process, so the
 * menu reads sessions directly from `ctx.sessionQuery` and routes navigation
 * to the renderer over IPC; the renderer owns selection. The desktop settings
 * namespace is registered once by the main process; this module consumes the
 * scope for the close-to-tray preference.
 * @module @deepseek-ai/dsh-desktop/tray
 */

import { Menu, Tray, nativeImage, type MenuItemConstructorOptions, type NativeImage } from 'electron'
import type { BrowserWindow } from 'electron'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import { IPC_CHANNELS } from './bridge-types.ts'
import type { DesktopSettings } from './desktop-settings.ts'

/** One recent-session row the tray menu lists. */
export interface TraySession {
  /** Session id, routed back to the renderer on click. */
  id: string
  /** Latest folded title; untitled sessions are never listed. */
  title: string
  /** Header creation timestamp (Unix epoch ms), for the relative-time sublabel. */
  createdAt: number
}

/** The menu's navigation actions, wired by the caller. */
export interface TrayMenuActions {
  /** Show and focus the shell window. */
  open(): void
  /** Ask the renderer to start a fresh session. */
  newSession(): void
  /** Ask the renderer to open one listed session. */
  openSession(sessionId: string): void
  /** Ask the updater for a manual check; absent rows omit the menu item. */
  checkUpdates?(): void
  /** Quit the app for real (dispose the host tree, then exit). */
  quit(): void
}

/** Maximum UTF-16 code units kept in a menu label; longer titles get an ellipsis. */
const MAX_TITLE_LENGTH = 48

/** The app name shown in the tray tooltip and the Open menu item. */
export const APP_NAME = 'BirdCoder'

/** How many recent sessions the tray menu lists (industry-typical quick-jump depth). */
const DEFAULT_MAX_RECENT_SESSIONS = 8

/** How often the Linux tray menu refreshes its static session list (AppIndicator has no popup hook). */
const LINUX_MENU_REFRESH_MS = 30_000

/**
 * Truncate a session title to a menu-safe length.
 * @param title - the folded title.
 * @returns the truncated label.
 */
export function truncateTitle(title: string): string {
  return title.length <= MAX_TITLE_LENGTH ? title : `${title.slice(0, MAX_TITLE_LENGTH - 1)}…`
}

/**
 * Render a compact relative-time sublabel for a session creation timestamp.
 * @param epochMs - the timestamp (Unix epoch ms).
 * @param nowMs - the reference "now" (injectable for tests).
 * @returns a Chinese relative label, or a calendar date past one week.
 */
export function relativeTimeLabel(epochMs: number, nowMs: number = Date.now()): string {
  const delta = Math.max(0, nowMs - epochMs)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  const date = new Date(epochMs)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Read the tray's recent-session rows from the host's session-query corpus:
 * top-level (non-subagent) sessions newest-first, keeping only sessions whose
 * log has folded a title (blank sessions have none and are skipped, matching
 * the product list's blank hiding).
 * @param query - the session-query service; `undefined` when the composition lacks it.
 * @param max - maximum rows; non-positive returns an empty list.
 * @returns bounded recent sessions.
 */
export async function loadTraySessions(
  query: SessionQueryEngine | undefined,
  max: number,
): Promise<TraySession[]> {
  const limit = Math.floor(max)
  if (query === undefined || !(limit > 0)) return []
  const records = await query.listSessions()
  const topLevel = records.filter(record => record.header.origin !== 'subagent')
  if (topLevel.length === 0) return []
  const sessions: TraySession[] = []
  for (let offset = 0; offset < topLevel.length && sessions.length < limit; offset += limit) {
    const batch = topLevel.slice(offset, offset + limit)
    const titles = await query.readTitleSnapshots(batch.map(record => record.header.id))
    const titleById = new Map(titles.map(result => [result.sessionId,
      result.status === 'fulfilled' ? result.value.title?.title : undefined]))
    for (const record of batch) {
      const title = titleById.get(record.header.id)
      if (title === undefined) continue
      sessions.push({ id: record.header.id, title: truncateTitle(title), createdAt: record.header.createdAt })
      if (sessions.length === limit) break
    }
  }
  return sessions
}

/**
 * Build the tray context-menu template: Open / New Session / recent sessions /
 * (optional manual update check) / Quit. The recent block lists up to
 * {@link loadTraySessions} rows with relative-time sublabels.
 * @param sessions - the current recent-session rows.
 * @param actions - the navigation callbacks.
 * @returns the menu template.
 */
export function buildTrayMenuTemplate(
  sessions: readonly TraySession[],
  actions: TrayMenuActions,
): MenuItemConstructorOptions[] {
  const sessionItems: MenuItemConstructorOptions[] = sessions.length === 0
    ? [{ label: '暂无最近会话', enabled: false }]
    : sessions.map(session => ({
      label: session.title,
      sublabel: relativeTimeLabel(session.createdAt),
      click: () => { actions.openSession(session.id) },
    }))
  return [
    { label: `打开 ${APP_NAME}`, click: () => { actions.open() } },
    { type: 'separator' },
    { label: '新建会话', click: () => { actions.newSession() } },
    { type: 'separator' },
    { label: '最近会话', enabled: false },
    ...sessionItems,
    { type: 'separator' },
    ...(actions.checkUpdates === undefined
      ? []
      : ([{ label: '检查更新', click: () => { actions.checkUpdates?.() } }, { type: 'separator' }] as MenuItemConstructorOptions[])),
    { label: '退出', click: () => { actions.quit() } },
  ]
}

/** Options for {@link installTray}. */
export interface InstallTrayOptions {
  /** The booted host tree: session-query service. */
  ctx: Context
  /** The shell window (created before the tray), or undefined while absent. */
  getWindow: () => BrowserWindow | undefined
  /** Real quit: set the quitting flag and call `app.quit()`. */
  quit: () => void
  /** The app icon path (build/icon.png), used for the tray image. */
  iconPath: string
  /** The registered desktop settings scope (see `registerDesktopSettings`); absent without a settings service. */
  settingsScope?: SettingsScope<DesktopSettings>
  /** Manual update check wired to the updater; absent rows omit the menu item. */
  checkUpdates?: () => void
  /** Platform override for tests; defaults to `process.platform`. */
  platform?: NodeJS.Platform
  /** Maximum recent-session rows; defaults to {@link DEFAULT_MAX_RECENT_SESSIONS}. */
  maxRecentSessions?: number
}

/** The installed tray surface the main process consults. */
export interface DesktopTray {
  /** Live close-to-tray preference; the window close handler consults this. */
  closeToTray(): boolean
  /** Destroy the tray and release every subscription. */
  dispose(): void
}

/**
 * Resize the product icon for the platform's tray slot. The macOS menu bar
 * wants a small bitmap; Windows and Linux scale the full icon acceptably.
 * @param iconPath - the app icon path.
 * @param platform - the host platform.
 * @returns the tray image.
 */
export function trayImage(iconPath: string, platform: NodeJS.Platform): NativeImage {
  const image = nativeImage.createFromPath(iconPath)
  if (platform === 'darwin' && !image.isEmpty()) {
    return image.resize({ width: 18, height: 18 })
  }
  return image
}

/**
 * Install the system tray: consume the desktop settings scope for the
 * close-to-tray preference, create the icon with platform-native click
 * behavior (macOS/Linux: click opens the menu; Windows and other platforms:
 * left click shows the window, right click pops the menu), and keep the
 * menu's session list fresh from the host corpus.
 * @param options - wiring described on {@link InstallTrayOptions}.
 * @returns the tray surface.
 */
export function installTray(options: InstallTrayOptions): DesktopTray {
  const platform = options.platform ?? process.platform
  const maxRecentSessions = options.maxRecentSessions ?? DEFAULT_MAX_RECENT_SESSIONS
  const query = options.ctx.get('sessionQuery')
  const settingsScope = options.settingsScope
  let closeToTray = settingsScope?.get().closeToTray ?? true
  const unwatchSettings = settingsScope?.watch((next) => { closeToTray = next.closeToTray })

  const tray = new Tray(trayImage(options.iconPath, platform))
  tray.setToolTip(APP_NAME)

  /** Interval timers owned by this install (Linux menu refresh); cleared on dispose. */
  const refreshTimers: ReturnType<typeof setInterval>[] = []

  const showWindow = (): void => {
    const win = options.getWindow()
    if (win === undefined || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }

  const sendToRenderer = (channel: string, payload?: unknown): void => {
    const win = options.getWindow()
    if (win === undefined || win.isDestroyed()) return
    if (payload === undefined) win.webContents.send(channel)
    else win.webContents.send(channel, payload)
  }

  const actions: TrayMenuActions = {
    open: showWindow,
    newSession: () => {
      sendToRenderer(IPC_CHANNELS.newSession)
      showWindow()
    },
    openSession: (sessionId) => {
      sendToRenderer(IPC_CHANNELS.openSession, { sessionId })
      showWindow()
    },
    ...(options.checkUpdates === undefined ? {} : { checkUpdates: options.checkUpdates }),
    quit: options.quit,
  }

  const buildMenu = async (): Promise<Menu> => {
    let sessions: TraySession[] = []
    try {
      sessions = await loadTraySessions(query, maxRecentSessions)
    } catch (error) {
      console.error('dsh-desktop: tray session list unavailable:', error)
    }
    return Menu.buildFromTemplate(buildTrayMenuTemplate(sessions, actions))
  }

  const popupMenu = (): void => {
    void buildMenu().then((menu) => {
      if (!tray.isDestroyed()) tray.popUpContextMenu(menu)
    })
  }

  const refreshLinuxMenu = (): void => {
    void buildMenu().then((menu) => {
      if (!tray.isDestroyed()) tray.setContextMenu(menu)
    })
  }

  const windowListeners = new Map<string, () => void>()
  if (platform === 'darwin') {
    // Menu-bar convention: clicking the icon opens the menu, whose first item
    // opens the window. The menu is rebuilt per popup, so sessions are fresh.
    tray.on('click', popupMenu)
    tray.on('right-click', popupMenu)
  } else if (platform === 'linux') {
    // AppIndicator/StatusNotifier: the desktop environment owns the icon and
    // opens the SET menu — click events are not reliably delivered. Refresh
    // the static menu on window focus/show and on an interval while running.
    tray.on('click', () => { showWindow(); refreshLinuxMenu() })
    refreshLinuxMenu()
    const focusListener = (): void => { refreshLinuxMenu() }
    const win = options.getWindow()
    win?.on('focus', focusListener)
    win?.on('show', focusListener)
    windowListeners.set('focus', focusListener)
    windowListeners.set('show', focusListener)
    const timer = setInterval(refreshLinuxMenu, LINUX_MENU_REFRESH_MS)
    refreshTimers.push(timer)
  } else {
    // Windows (and unknown platforms): left click toggles the window, right
    // click pops the session menu fresh.
    tray.on('click', showWindow)
    tray.on('double-click', showWindow)
    tray.on('right-click', popupMenu)
  }

  return {
    closeToTray: () => closeToTray,
    dispose: () => {
      tray.destroy()
      unwatchSettings?.()
      for (const timer of refreshTimers) clearInterval(timer)
      const win = options.getWindow()
      if (win !== undefined && !win.isDestroyed()) {
        const focusListener = windowListeners.get('focus')
        if (focusListener !== undefined) win.removeListener('focus', focusListener)
        const showListener = windowListeners.get('show')
        if (showListener !== undefined) win.removeListener('show', showListener)
      }
    },
  }
}
