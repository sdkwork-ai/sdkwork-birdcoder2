/**
 * The Knowledge Base placeholder page: the center-column surface for the
 * `knowledge` mode, keyed into the frame's `mode.page` slot. Renders a hero
 * glyph, the mode name, and a construction notice with a hint back to the
 * Code workbench.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { KnowledgeIcon } from './icons.tsx'
import css from './KnowledgePage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface KnowledgePageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'knowledge'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type KnowledgePageProps =
  PropsRuntime<'mode.page'>
  & KnowledgePageInjected
  & PropsLocale<'knowledge'>

/**
 * Render the Knowledge Base placeholder page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function KnowledgePage({ mode, t }: KnowledgePageProps) {
  return (
    <div className={css.page} data-mode={mode} data-mode-page={mode}>
      <KnowledgeIcon size={56} className={css.heroIcon} />
      <div className={css.title}>{t('mode.knowledge')}</div>
      <div className={css.placeholder}>{t('page.placeholder')}</div>
      <div className={css.hint}>{t('page.back')}</div>
    </div>
  )
}
