/**
 * Sign-in-required face for the embedded market catalogs.
 *
 * Every cloud catalog reads the SDKWork app-api through a generated app SDK
 * that cannot dispatch without an application Access-Token, so a host that
 * holds no credentials would otherwise render the transport's own error line
 * instead of a market. The face states the requirement and hands the gesture
 * back to this application's login entry: the button raises the same sign-in
 * surface the settings menu does, with the login methods the deployment
 * serves, and the catalog loads as soon as a session lands.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconUserOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './MarketsPage.module.css'

/** Props for the sign-in-required market page surface. */
export interface MarketsAuthSurfaceProps {
  /** Markets namespace translate seat for the sign-in copy. */
  t: TranslateNS<'markets'>
  /** Open the application's own sign-in surface. */
  onSignIn: () => void
}

/**
 * Render the sign-in-required panel.
 * @param props - the Markets locale seat and the sign-in gesture.
 * @returns the themed sign-in-required face.
 */
export function MarketsAuthSurface({ t, onSignIn }: MarketsAuthSurfaceProps) {
  return (
    <div className={`${css.empty} ${css.authSurface}`} data-markets-auth-required="true">
      <div className={css.emptyIconTile}>
        <IconUserOutlineRegular size={28} />
      </div>
      <p className={css.emptyTitle}>{t('surface.auth.title')}</p>
      <p className={css.emptyDetail}>{t('surface.auth.detail')}</p>
      <Button variant="primary" className={css.emptySignIn} onClick={onSignIn}>
        {t('surface.auth.action')}
      </Button>
    </div>
  )
}
