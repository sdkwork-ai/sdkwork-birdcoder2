/**
 * The General-settings row for the desktop shell's update preferences: the
 * auto-check switch, the release channel select, the auto-download switch, a
 * manual check button, and a status line fed by the bridge-pushed update
 * state. This plugin is the desktop shell's chrome surface, so it owns the
 * shell preference row; the host-side namespace registration lived with the
 * pre-0.1.5-rc shell (apps/desktop/src/desktop-settings.ts, removed by the
 * upstream desktop architecture merge — migration to the new DESKTOP_IPC
 * surface is pending). Renders nothing
 * until the settings scope accepts a section (the row never guesses a value
 * it cannot read).
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings.general.item slot declaration and the
// ctx.configForms Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'
import type { createUpdateSettingsRowStore } from './update-settings-store.ts'
import type { UpdateChannel } from './update-settings.ts'
import { UPDATE_CHANNELS } from './update-settings.ts'
import type { SdkworkUpdaterKey } from './locales.ts'
import css from './UpdateSettingsRow.module.css'

/** Injected business face: the durable preference writes and the manual check. */
export interface UpdateSettingsRowInjected {
  /** Persist the auto-check switch. */
  setAutoCheck: (value: boolean) => void
  /** Persist the release channel. */
  setChannel: (value: UpdateChannel) => void
  /** Persist the auto-download switch. */
  setAutoDownload: (value: boolean) => void
  /** Ask the updater for a quiet check now. */
  check: () => void
}

/** Full component props: root runtime share + store share + injected face. */
export type UpdateSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsStore<ReturnType<typeof createUpdateSettingsRowStore>>
  & PropsLocale<'sdkworkUpdater'>
  & UpdateSettingsRowInjected

type Translate = (key: SdkworkUpdaterKey, params?: Record<string, string>) => string

/**
 * The one-line status the row shows under the controls, derived from the
 * bridge-pushed update state; nothing when the updater is quiescent.
 * @param state - the mirrored update slice (only the fields this label reads).
 * @returns the status label, or undefined for quiet phases.
 */
export function updateStatusText(state: {
  phase: DesktopUpdateState['phase']
  version?: string | undefined
  error?: string | undefined
}, t: Translate): string | undefined {
  if (state.error !== undefined) {
    return state.phase === 'idle'
      ? t('status.checkFailed', { error: state.error })
      : t('status.downloadFailed', { error: state.error })
  }
  switch (state.phase) {
    case 'checking': return t('status.checking')
    case 'available':
    case 'downloading':
    case 'downloaded': return t('status.available', { version: state.version ?? '' })
    default: return undefined
  }
}

/** Human labels for the channel select options. */
export function channelLabels(t: Translate): Record<UpdateChannel, string> {
  return {
    follow: t('channel.follow'),
    stable: t('channel.stable'),
    rc: t('channel.rc'),
  }
}

/**
 * Render the update preferences row.
 * @param props - composed slot props.
 * @returns the row element tree, or nothing before the scope has a value.
 */
export function UpdateSettingsRow({ setAutoCheck, setChannel, setAutoDownload, check, useStore, t }: UpdateSettingsRowProps): ReactNode {
  const autoCheckUpdates = useStore(s => s.autoCheckUpdates)
  const updateChannel = useStore(s => s.updateChannel)
  const autoDownload = useStore(s => s.autoDownload)
  const writable = useStore(s => s.writable)
  const canInstall = useStore(s => s.canInstall)
  const status = useStore(s => updateStatusText(s, t))
  if (autoCheckUpdates === undefined || updateChannel === undefined || autoDownload === undefined) return null
  return (
    <div className={css.row}>
      <div className={css.copy}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.description}>
          {canInstall ? t('settings.description.installable') : t('settings.description.manual')}
        </div>
      </div>
      <div className={css.controls}>
        <label className={css.control}>
          <span>{t('settings.autoCheck')}</span>
          <button
            type="button"
            role="switch"
            className={css.switch}
            aria-checked={autoCheckUpdates}
            aria-label={t('settings.autoCheck')}
            disabled={!writable}
            onClick={() => { setAutoCheck(!autoCheckUpdates) }}
          >
            <span className={css.track} data-on={autoCheckUpdates || undefined} aria-hidden="true">
              <span className={css.thumb} />
            </span>
          </button>
        </label>
        <label className={css.control}>
          <span>{t('settings.channel')}</span>
          <select
            className={css.select}
            value={updateChannel}
            disabled={!writable}
            onChange={(event) => { setChannel(event.target.value as UpdateChannel) }}
          >
            {UPDATE_CHANNELS.map(channel => (
              <option key={channel} value={channel}>{channelLabels(t)[channel]}</option>
            ))}
          </select>
        </label>
        <label className={css.control}>
          <span>{t('settings.autoDownload')}</span>
          <button
            type="button"
            role="switch"
            className={css.switch}
            aria-checked={autoDownload}
            aria-label={t('settings.autoDownload')}
            disabled={!writable || !canInstall}
            onClick={() => { setAutoDownload(!autoDownload) }}
          >
            <span className={css.track} data-on={autoDownload || undefined} aria-hidden="true">
              <span className={css.thumb} />
            </span>
          </button>
        </label>
        <button type="button" className={css.check} onClick={check}>{t('settings.check')}</button>
        {status !== undefined && <div className={css.status}>{status}</div>}
      </div>
    </div>
  )
}
