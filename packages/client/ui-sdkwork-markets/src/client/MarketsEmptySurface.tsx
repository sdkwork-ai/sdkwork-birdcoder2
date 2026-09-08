/**
 * Unconfigured status face for the embedded market pages. When the host
 * adapter reports no gateway the tab panel keeps a complete host-themed
 * surface with a status panel instead of collapsing blank.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginsIcon } from './icons.tsx'
import css from './MarketsPage.module.css'

/** Props for the unconfigured market page surface. */
export interface MarketsEmptySurfaceProps {
  /** Markets namespace translate seat for the status copy. */
  t: TranslateNS<'markets'>
}

/**
 * Render the no-gateway status panel.
 * @param props - the Markets locale seat.
 * @returns the themed unconfigured face.
 */
export function MarketsEmptySurface({ t }: MarketsEmptySurfaceProps) {
  return (
    <div className={css.empty} data-markets-empty="unconfigured">
      <div className={css.emptyIconTile}>
        <PluginsIcon size={28} />
      </div>
      <p className={css.emptyTitle}>{t('surface.unconfigured.title')}</p>
      <p className={css.emptyDetail}>{t('surface.unconfigured.detail')}</p>
    </div>
  )
}
