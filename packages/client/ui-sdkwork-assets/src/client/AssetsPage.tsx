/**
 * The Assets placeholder page: the center-column surface for the
 * `assets` mode, keyed into the frame's `mode.page` slot. Renders a hero
 * glyph, the mode name, and a construction notice with a hint back to the
 * Code workbench.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { AssetIcon } from './icons.tsx'
import css from './AssetsPage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface AssetsPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'assets'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type AssetsPageProps =
  PropsRuntime<'mode.page'>
  & AssetsPageInjected
  & PropsLocale<'assets'>

/**
 * Render the Assets placeholder page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function AssetsPage({ mode, t }: AssetsPageProps) {
  return (
    <div className={css.page} data-mode={mode} data-mode-page={mode}>
      <AssetIcon size={56} className={css.heroIcon} />
      <div className={css.title}>{t('mode.assets')}</div>
      <div className={css.placeholder}>{t('page.placeholder')}</div>
      <div className={css.hint}>{t('page.back')}</div>
    </div>
  )
}
