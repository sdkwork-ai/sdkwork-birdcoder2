/**
 * Unconfigured status face for the embedded demands catalog. When the host
 * adapter reports no gateway the page keeps a complete host-themed surface
 * with a status panel instead of collapsing blank.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { DemandHallIcon } from './icons.tsx'
import css from './DemandHallPage.module.css'

/** Props for the unconfigured Demand Hall surface. */
export interface DemandHallEmptySurfaceProps {
  /** Demand Hall namespace translate seat for the status copy. */
  t: TranslateNS<'demand-hall'>
}

/**
 * Render the no-gateway status panel.
 * @param props - the Demand Hall locale seat.
 * @returns the themed unconfigured face.
 */
/* jscpd:ignore-start -- the deliberate per-package copy shared with
   ui-sdkwork-markets and ui-sdkwork-template-library. */
export function DemandHallEmptySurface({ t }: DemandHallEmptySurfaceProps) {
  return (
    <div className={css.empty} data-demand-hall-empty="unconfigured">
      <div className={css.emptyIconTile}>
        <DemandHallIcon size={28} />
      </div>
      <p className={css.emptyTitle}>{t('surface.unconfigured.title')}</p>
      <p className={css.emptyDetail}>{t('surface.unconfigured.detail')}</p>
    </div>
  )
}
/* jscpd:ignore-end */
