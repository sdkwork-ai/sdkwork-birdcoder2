/**
 * One General-settings row for a boolean app-mode surface preference: a labeled
 * switch over the `ui-sdkwork-app-modes` settings namespace. The row is generic
 * because both shipped rows share the whole interaction — a title, a
 * description, and a switch that mirrors the durable value — and differ only in
 * the field they write and the sentence they read. The registration supplies
 * the two locale keys and the write callback; the component owns the switch and
 * renders nothing until the settings scope accepts a section (a row never
 * guesses a value it cannot read).
 *
 * The sidebar row additionally applies its preference to the frame immediately
 * when it writes; that stays in the registration's callback, because it is that
 * row's extra effect and not part of the shared row.
 */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings.general.item slot declaration and the
// ctx.configForms Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createSettingsToggleStore } from './settings-toggle-store.ts'
import type { AppModeKey } from './locales.ts'
import css from './SettingsToggleRow.module.css'

/** Injected business face: which copy to show and where to persist the write. */
export interface SettingsToggleRowInjected {
  /** Locale key of the row title (also its switch's accessible name). */
  readonly titleKey: AppModeKey
  /** Locale key of the sentence under the title. */
  readonly descriptionKey: AppModeKey
  /**
   * Persist the preference, and apply any immediate surface effect it owns.
   * @param value - the state the switch asks for.
   */
  setVisible: (value: boolean) => void
}

/** Full component props: root runtime share + store share + injected face + locale seat. */
export type SettingsToggleRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsStore<ReturnType<typeof createSettingsToggleStore>>
  & SettingsToggleRowInjected
  & PropsLocale<'appMode'>

/**
 * Render one boolean preference row.
 * @param props - composed slot props.
 * @returns the row element tree, or nothing before the scope has a value.
 */
export function SettingsToggleRow({
  titleKey, descriptionKey, setVisible, useStore, t,
}: SettingsToggleRowProps): ReactNode {
  const value = useStore(s => s.value)
  const writable = useStore(s => s.writable)
  if (value === undefined) return null
  return (
    <div className={css.row}>
      <div className={css.copy}>
        <div className={css.title}>{t(titleKey)}</div>
        <div className={css.description}>{t(descriptionKey)}</div>
      </div>
      <button
        type="button"
        role="switch"
        className={css.switch}
        aria-checked={value}
        aria-label={t(titleKey)}
        disabled={!writable}
        onClick={() => { setVisible(!value) }}
      >
        <span className={css.track} data-on={value || undefined} aria-hidden="true">
          <span className={css.thumb} />
        </span>
      </button>
    </div>
  )
}
