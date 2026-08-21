/**
 * The desktop shell's durable user preferences: one `desktop` settings
 * namespace registered against the host settings service, owned by the shell's
 * main process (tray and auto-update both consume the scope) and mirrored by
 * the browser scope in `dsh-client-ui-sdkwork-window-controls` / `dsh-client-ui-sdkwork-updater`.
 * @module @deepseek-ai/dsh-desktop/settings
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the desktop shell. */
const DESKTOP_SETTINGS_NAMESPACE = 'desktop'

/** Field carrying the close-to-tray preference in the desktop settings section. */
const CLOSE_TO_TRAY_FIELD = 'closeToTray'

/** Field carrying the auto-check switch in the desktop settings section. */
const AUTO_CHECK_UPDATES_FIELD = 'autoCheckUpdates'

/** Field carrying the update channel in the desktop settings section. */
const UPDATE_CHANNEL_FIELD = 'updateChannel'

/** Field carrying the auto-download switch in the desktop settings section. */
const AUTO_DOWNLOAD_UPDATES_FIELD = 'autoDownload'

/** Update channels the desktop shell can follow. */
const UPDATE_CHANNELS = ['follow', 'stable', 'rc'] as const

/** Which release channel the updater accepts. */
export type UpdateChannel = typeof UPDATE_CHANNELS[number]

/** The desktop shell's durable user preferences. */
export interface DesktopSettings {
  /** Whether closing the window hides it to the tray instead of quitting. */
  closeToTray: boolean
  /** Whether the updater checks for new versions on boot and on an interval. */
  autoCheckUpdates: boolean
  /** Which release channel the updater accepts ('follow' matches the installed version's channel). */
  updateChannel: UpdateChannel
  /** Whether an available update downloads immediately instead of prompting. */
  autoDownload: boolean
}

/** Durable desktop-shell schema; also the wire envelope the browser scope validates against. */
export const DesktopSettingsSchema: z<DesktopSettings> = z.object({
  [CLOSE_TO_TRAY_FIELD]: z.boolean().default(true),
  [AUTO_CHECK_UPDATES_FIELD]: z.boolean().default(true),
  [UPDATE_CHANNEL_FIELD]: z.union([...UPDATE_CHANNELS]).default('follow'),
  [AUTO_DOWNLOAD_UPDATES_FIELD]: z.boolean().default(false),
})

/**
 * Register the desktop settings namespace once against the host settings
 * service. The shell's main process is the sole registrant; tray and updater
 * consume the returned scope.
 * @param ctx - the booted host tree.
 * @returns the owner scope, or undefined without a settings service.
 */
export function registerDesktopSettings(ctx: Context): SettingsScope<DesktopSettings> | undefined {
  // The cordis Context merge types `settings` as the provider; a composition
  // without the settings service leaves it absent at runtime.
  const settings = ctx.get('settings')
  if (settings === undefined) return undefined
  return settings.register(
    settingsNamespace(DESKTOP_SETTINGS_NAMESPACE),
    DesktopSettingsSchema,
    { applies: 'live' },
  )
}
