/**
 * Unconfigured status face for the embedded App Store column. When the host
 * adapter reports no gateway the column keeps a complete host-themed surface
 * with a status panel instead of collapsing blank.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { AppStoreIcon } from './icons.tsx'
import css from './AppStorePage.module.css'

/** Props for the unconfigured App Store surface. */
export interface AppstoreEmptySurfaceProps {
  /** App Store namespace translate seat for the status copy. */
  t: TranslateNS<'appstore'>
}

/**
 * Render the no-gateway status panel.
 * @param props - the App Store locale seat.
 * @returns the themed unconfigured face.
 */
export function AppstoreEmptySurface({ t }: AppstoreEmptySurfaceProps) {
  return (
    <div className={css.empty} data-appstore-empty="unconfigured">
      <div className={css.emptyIconTile}>
        <AppStoreIcon size={28} />
      </div>
      <p className={css.emptyTitle}>{t('surface.unconfigured.title')}</p>
      <p className={css.emptyDetail}>{t('surface.unconfigured.detail')}</p>
    </div>
  )
}
