/**
 * The General-settings row for the desktop shell's update preferences: the
 * auto-check switch, the release channel select, the auto-download switch, a
 * manual check button, and a status line fed by the bridge-pushed update
 * state. This plugin is the desktop shell's chrome surface, so it owns the
 * shell preference row; the host-side namespace registration lives with the
 * shell's main process (apps/desktop/src/desktop-settings.ts). Renders nothing
 * until the settings scope accepts a section (the row never guesses a value
 * it cannot read).
 */
import type { ReactNode } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings.general.item slot declaration and the
// ctx.settingsScope Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'
import type { createUpdateSettingsRowStore } from './update-settings-store.ts'
import type { UpdateChannel } from './update-settings.ts'
import { UPDATE_CHANNELS } from './update-settings.ts'
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
  & UpdateSettingsRowInjected

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
}): string | undefined {
  if (state.error !== undefined) {
    return state.phase === 'idle' ? `检查更新失败：${state.error}` : `下载失败：${state.error}`
  }
  switch (state.phase) {
    case 'checking': return '正在检查更新…'
    case 'available':
    case 'downloading':
    case 'downloaded': return `发现新版本 v${state.version}`
    default: return undefined
  }
}

/** Human labels for the channel select options. */
export const CHANNEL_LABELS: Record<UpdateChannel, string> = {
  follow: '跟随已安装版本',
  stable: '仅稳定版',
  rc: '稳定版和预发布',
}

/**
 * Render the update preferences row.
 * @param props - composed slot props.
 * @returns the row element tree, or nothing before the scope has a value.
 */
export function UpdateSettingsRow({ setAutoCheck, setChannel, setAutoDownload, check, useStore }: UpdateSettingsRowProps): ReactNode {
  const autoCheckUpdates = useStore(s => s.autoCheckUpdates)
  const updateChannel = useStore(s => s.updateChannel)
  const autoDownload = useStore(s => s.autoDownload)
  const writable = useStore(s => s.writable)
  const canInstall = useStore(s => s.canInstall)
  const status = useStore(s => updateStatusText(s))
  if (autoCheckUpdates === undefined || updateChannel === undefined || autoDownload === undefined) return null
  return (
    <div className={css.row}>
      <div className={css.copy}>
        <div className={css.title}>自动更新</div>
        <div className={css.description}>
          {canInstall ? '发现新版本时提示下载；下载完成后重启安装' : '发现新版本时提示；请从发布页手动安装'}
        </div>
      </div>
      <div className={css.controls}>
        <label className={css.control}>
          <span>自动检查更新</span>
          <button
            type="button"
            role="switch"
            className={css.switch}
            aria-checked={autoCheckUpdates}
            aria-label="自动检查更新"
            disabled={!writable}
            onClick={() => { setAutoCheck(!autoCheckUpdates) }}
          >
            <span className={css.track} data-on={autoCheckUpdates || undefined} aria-hidden="true">
              <span className={css.thumb} />
            </span>
          </button>
        </label>
        <label className={css.control}>
          <span>更新通道</span>
          <select
            className={css.select}
            value={updateChannel}
            disabled={!writable}
            onChange={(event) => { setChannel(event.target.value as UpdateChannel) }}
          >
            {UPDATE_CHANNELS.map(channel => (
              <option key={channel} value={channel}>{CHANNEL_LABELS[channel]}</option>
            ))}
          </select>
        </label>
        <label className={css.control}>
          <span>自动下载</span>
          <button
            type="button"
            role="switch"
            className={css.switch}
            aria-checked={autoDownload}
            aria-label="自动下载"
            disabled={!writable || !canInstall}
            onClick={() => { setAutoDownload(!autoDownload) }}
          >
            <span className={css.track} data-on={autoDownload || undefined} aria-hidden="true">
              <span className={css.thumb} />
            </span>
          </button>
        </label>
        <button type="button" className={css.check} onClick={check}>检查更新</button>
        {status !== undefined && <div className={css.status}>{status}</div>}
      </div>
    </div>
  )
}
