/**
 * The General-settings row for the sidebar-visibility preference: a labeled
 * switch over the `ui-app-modes` settings namespace. The row mirrors the
 * durable preference (its switch state); turning it off collapses the
 * sidebar to its control rail immediately through `ctx.layout`, and the
 * preference is re-applied as the boot default on later starts. Renders
 * nothing until the settings scope accepts a section (the row never guesses
 * a value it cannot read).
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings.general.item slot declaration and the
// ctx.settingsScope Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createSidebarSettingsRowStore } from './sidebar-settings-store.ts'
import css from './SidebarSettingsRow.module.css'

/** Injected business face: the durable preference write plus the live layout apply. */
export interface SidebarSettingsRowInjected {
  /**
   * Persist the sidebar-visibility preference and apply it to the frame
   * immediately (false collapses the sidebar to its control rail).
   * @param value - whether the sidebar renders wide content.
   */
  setSidebarVisible: (value: boolean) => void
}

/** Full component props: root runtime share + store share + injected face + locale seat. */
export type SidebarSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsStore<ReturnType<typeof createSidebarSettingsRowStore>>
  & SidebarSettingsRowInjected
  & PropsLocale<'appMode'>

/**
 * Render the sidebar-visibility preference row.
 * @param props - composed slot props.
 * @returns the row element tree, or nothing before the scope has a value.
 */
export function SidebarSettingsRow({ setSidebarVisible, useStore, t }: SidebarSettingsRowProps): ReactNode {
  const visible = useStore(s => s.visible)
  const writable = useStore(s => s.writable)
  if (visible === undefined) return null
  return (
    <div className={css.row}>
      <div className={css.copy}>
        <div className={css.title}>{t('sidebar.show')}</div>
        <div className={css.description}>{t('sidebar.show.description')}</div>
      </div>
      <button
        type="button"
        role="switch"
        className={css.switch}
        aria-checked={visible}
        aria-label={t('sidebar.show')}
        disabled={!writable}
        onClick={() => { setSidebarVisible(!visible) }}
      >
        <span className={css.track} data-on={visible || undefined} aria-hidden="true">
          <span className={css.thumb} />
        </span>
      </button>
    </div>
  )
}
