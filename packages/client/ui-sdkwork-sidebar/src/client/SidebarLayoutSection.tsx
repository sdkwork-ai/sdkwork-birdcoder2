/**
 * The Sidebar settings page: the left column's entry visibility.
 *
 * A section, not a dialog, because that is the shape the settings shell has:
 * contributing one `settings.section` puts a row in the nav rail and a page in
 * the content column, and the shell keeps zero knowledge of what a sidebar
 * entry is.
 *
 * The page lists every row the column can currently draw — quick entries,
 * registry pages, and global panel rows — and one switch per row. A switch
 * writes the persisted preference immediately, so the column behind the
 * settings dialog re-renders live and there is no draft step to lose. The
 * page renders the published layout, never its own optimism: a row the
 * preference cannot hide (the fixed panel launcher) is not listed at all.
 *
 * Groups follow the column's own reading order, so a reader who wants "the
 * second quick entry" finds it where it sits on the column rather than in an
 * alphabetical list.
 */
import { useMemo, type ReactNode } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings.section slot declaration this component is mounted from.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SidebarLayoutSnapshot } from './layout.ts'
import { SIDEBAR_ITEM_GROUPS } from './layout.ts'
import type { SidebarLayoutKey } from './layout-locales.ts'
import css from './SidebarLayoutSection.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The sidebar-items settings page copy. */
    sidebarLayout: SidebarLayoutKey
  }
}

/** Registration-side business face: the preference's two writes. */
export type SidebarLayoutSectionInjected = {
  /** Registrant-private reactive sources: the published layout. */
  hooks: {
    /** The rows the column can draw and the ids the user hid. */
    layout: ObservableSnapshot<SidebarLayoutSnapshot>
  }
  /**
   * Persist whether one entry is drawn in the left column.
   * @param id - the row's stable id.
   * @param visible - whether the column draws the row.
   */
  setVisible: (id: string, visible: boolean) => void
  /** Restore the shipped preference: every entry visible. */
  reset: () => void
}

/** Full component props: section runtime share + injected face + locale seat. */
export type SidebarLayoutSectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<SidebarLayoutSectionInjected>
  & PropsLocale<'sidebarLayout'>

/**
 * Render the Sidebar settings page.
 * @param props - composed slot props (runtime share + injected face + locale seat).
 * @returns the section element tree.
 */
export function SidebarLayoutSection({ useLayout, setVisible, reset, t }: SidebarLayoutSectionProps): ReactNode {
  const { items, hidden } = useLayout(snapshot => snapshot)
  const hiddenIds = useMemo(() => new Set(hidden), [hidden])
  const groups = SIDEBAR_ITEM_GROUPS
    .map(group => ({ group, rows: items.filter(item => item.group === group) }))
    .filter(entry => entry.rows.length > 0)

  return (
    <div className={css.section}>
      <div className={css.header}>
        <h2 className={css.heading}>{t('title')}</h2>
        {/* Quiet and always present while something is hidden: a hover-only
            control is invisible to touch and to a keyboard scan. */}
        {hidden.length > 0 && (
          <button type="button" className={css.reset} onClick={reset}>{t('reset')}</button>
        )}
      </div>
      <p className={css.intro}>{t('intro')}</p>

      {groups.length === 0 && <p className={css.empty}>{t('empty')}</p>}

      {groups.map(({ group, rows }) => (
        <section key={group} className={css.group} aria-label={t(`group.${group}`)}>
          <h3 className={css.groupTitle}>{t(`group.${group}`)}</h3>
          <ul className={css.list}>
            {rows.map(item => (
              <li key={`${group}:${item.id}`} className={css.row}>
                <span className={css.name}>{item.title}</span>
                <Switch
                  checked={!hiddenIds.has(item.id)}
                  label={t('toggle', { name: item.title })}
                  onChange={(next) => { setVisible(item.id, next) }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
