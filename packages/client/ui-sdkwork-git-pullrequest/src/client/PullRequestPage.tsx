/**
 * The Pull Request placeholder page: the center-column surface for the
 * `pull-request` mode, keyed into the frame's `mode.page` slot. Renders a
 * hero glyph, the mode name, and a construction notice naming the upcoming
 * Git-backed review surface. The page owns its full column surface; the
 * sidebar column stays beside it.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { PullRequestIcon } from './icons.tsx'
import css from './PullRequestPage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface PullRequestPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'pull-request'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type PullRequestPageProps =
  PropsRuntime<'mode.page'>
  & PullRequestPageInjected
  & PropsLocale<'pullRequest'>

/**
 * Render the Pull Request placeholder page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function PullRequestPage({ mode, t }: PullRequestPageProps) {
  return (
    <div className={css.page} data-mode={mode} data-mode-page={mode}>
      <PullRequestIcon size={56} className={css.heroIcon} />
      <div className={css.title}>{t('mode.pullRequest')}</div>
      <div className={css.placeholder}>{t('page.placeholder')}</div>
    </div>
  )
}
