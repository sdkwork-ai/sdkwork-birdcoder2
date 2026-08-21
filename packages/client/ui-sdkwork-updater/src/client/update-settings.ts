/**
 * Durable desktop-shell preferences owned by the updater. The host-side schema
 * registration lives in the desktop app's main process
 * (apps/desktop/src/desktop-settings.ts); this file declares the browser
 * scope's view of the same namespace. The two copies of the namespace/field
 * names are deliberate: the app and the client stack are separate packages
 * with no shared import allowed across the client bundle boundary.
 */

/** Settings namespace owned by the desktop shell (host registration in apps/desktop/src/desktop-settings.ts). */
export const DESKTOP_SETTINGS_NAMESPACE = 'desktop'

/** Field carrying the auto-check switch in the desktop settings section. */
export const AUTO_CHECK_UPDATES_FIELD = 'autoCheckUpdates'

/** Field carrying the update channel in the desktop settings section. */
export const UPDATE_CHANNEL_FIELD = 'updateChannel'

/** Field carrying the auto-download switch in the desktop settings section. */
export const AUTO_DOWNLOAD_UPDATES_FIELD = 'autoDownload'

/** Update channels the desktop shell can follow. */
export const UPDATE_CHANNELS = ['follow', 'stable', 'rc'] as const

/** Which release channel the updater accepts. */
export type UpdateChannel = typeof UPDATE_CHANNELS[number]

/** The browser-visible updater preferences. */
export interface DesktopUpdateSettings {
  /** Whether the updater checks for new versions on boot and on an interval. */
  autoCheckUpdates: boolean
  /** Which release channel the updater accepts ('follow' matches the installed version's channel). */
  updateChannel: UpdateChannel
  /** Whether an available update downloads immediately instead of prompting. */
  autoDownload: boolean
}
