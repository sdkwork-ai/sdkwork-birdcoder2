/**
 * The General-settings row for the desktop shell's close-to-tray preference: a
 * labeled switch over the `desktop` settings namespace. This plugin is the
 * desktop shell's chrome surface, so it owns the shell preference row; the
 * host-side namespace registration lives with the tray in the app's main
 * process. Renders nothing until the settings scope accepts a section (the row
 * never guesses a value it cannot read).
 */
import type { ReactNode } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings.general.item slot declaration and the
// ctx.settingsScope Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createTraySettingsRowStore } from './tray-settings-store.ts'
import css from './TraySettingsRow.module.css'

/** Injected business face: the durable preference write. */
export interface TraySettingsRowInjected {
  /** Persist the close-to-tray preference. */
  setCloseToTray: (value: boolean) => void
}

/** Full component props: root runtime share + store share + injected face. */
export type TraySettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsStore<ReturnType<typeof createTraySettingsRowStore>>
  & TraySettingsRowInjected

/**
 * Render the close-to-tray preference row.
 * @param props - composed slot props.
 * @returns the row element tree, or nothing before the scope has a value.
 */
export function TraySettingsRow({ setCloseToTray, useStore }: TraySettingsRowProps): ReactNode {
  const enabled = useStore(s => s.enabled)
  const writable = useStore(s => s.writable)
  if (enabled === undefined) return null
  return (
    <div className={css.row}>
      <div className={css.copy}>
        <div className={css.title}>关闭窗口时最小化到托盘</div>
        <div className={css.description}>窗口关闭后程序继续在后台运行，可从托盘图标重新打开</div>
      </div>
      <button
        type="button"
        role="switch"
        className={css.switch}
        aria-checked={enabled}
        aria-label="关闭窗口时最小化到托盘"
        disabled={!writable}
        onClick={() => { setCloseToTray(!enabled) }}
      >
        <span className={css.track} data-on={enabled || undefined} aria-hidden="true">
          <span className={css.thumb} />
        </span>
      </button>
    </div>
  )
}
