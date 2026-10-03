/**
 * Unconfigured status face for the embedded templates catalog. When the host
 * adapter reports no gateway the page keeps a complete host-themed surface
 * with a status panel instead of collapsing blank.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { TemplateLibraryIcon } from './icons.tsx'
import css from './TemplateLibraryPage.module.css'

/** Props for the unconfigured Template Library surface. */
export interface TemplateLibraryEmptySurfaceProps {
  /** Template Library namespace translate seat for the status copy. */
  t: TranslateNS<'template-library'>
}

/**
 * Render the no-gateway status panel.
 * @param props - the Template Library locale seat.
 * @returns the themed unconfigured face.
 */
/* jscpd:ignore-start -- the deliberate per-package copy shared with
   ui-sdkwork-markets and ui-sdkwork-appstore. */
export function TemplateLibraryEmptySurface({ t }: TemplateLibraryEmptySurfaceProps) {
  return (
    <div className={css.empty} data-template-library-empty="unconfigured">
      <div className={css.emptyIconTile}>
        <TemplateLibraryIcon size={28} />
      </div>
      <p className={css.emptyTitle}>{t('surface.unconfigured.title')}</p>
      <p className={css.emptyDetail}>{t('surface.unconfigured.detail')}</p>
    </div>
  )
}
/* jscpd:ignore-end */
