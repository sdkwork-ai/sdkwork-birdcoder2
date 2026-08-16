/**
 * Placeholder mode page: the center-column surface for a mode without a real
 * product yet (Work/Video/Image/AppStore). The mode id arrives through the
 * keyed registration's inject closure; the page renders a hero glyph, the
 * mode name, and a construction notice with a hint back to the Code
 * workbench.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { BaseAppModeId } from './base-modes.ts'
import { MODE_ICONS } from './icons.tsx'
import css from './ModePage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface ModePageInjected {
  /** The placeholder page's own mode id (the keyed registration's key). */
  mode: BaseAppModeId
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type ModePageProps = PropsRuntime<'mode.page'> & ModePageInjected & PropsLocale<'appMode'>

/**
 * Render a placeholder mode page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function ModePage({ mode, t }: ModePageProps) {
  const Icon = MODE_ICONS[mode]
  return (
    <div className={css.page} data-mode={mode} data-mode-page={mode}>
      <Icon size={56} className={css.heroIcon} />
      <div className={css.title}>{t(`mode.${mode}`)}</div>
      <div className={css.placeholder}>{t('page.placeholder')}</div>
      <div className={css.hint}>{t('page.back')}</div>
    </div>
  )
}
