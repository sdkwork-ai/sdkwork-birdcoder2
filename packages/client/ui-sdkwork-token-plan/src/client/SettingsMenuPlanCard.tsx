/**
 * Settings-menu wallet card: the signed-in account's plan and compute-point
 * balance directly under the usage card.
 *
 * The card owns the account-facing half of the Token Plan surface: it reads
 * the same Membership commerce service the page uses, so the figures cannot
 * drift from the catalog or the points dialogs. Both actions leave the menu:
 * `升级套餐` opens the Token Plan mode, `购买积分` asks the shell for the points
 * purchase modal on the `settings.pointsRecharge` seat. The menu takes itself
 * down first in both cases so it never covers the surface it opened, and the
 * purchase modal lives on the shell rather than in this card because the
 * popover unmounts its content on close.
 *
 * The card has no cache of its own: mounting it re-reads the wallet, so the
 * balance the user sees after a top-up is the settled one.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the 'settings.menu.plan' owner share into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TokenPlanAccountSummary } from './token-plan-service.ts'
import { formatPointBalance, planLabelOf } from './points-format.ts'
import css from './SettingsMenuPlanCard.module.css'

/** Injected business face of the wallet card. */
export interface SettingsMenuPlanInjected {
  /** Whether an IAM session currently exists (the card stays absent otherwise). */
  signedIn: () => boolean
  /** Read the signed-in account's plan and point balance. */
  readSummary: () => Promise<TokenPlanAccountSummary | undefined>
  /** Leave the menu for the Token Plan surface. */
  openTokenPlan: () => void
}

/** Full props: the seat owner share, the injected commerce face, and the locale seat. */
export type SettingsMenuPlanCardProps =
  PropsRuntime<'settings.menu.plan'>
  & InjectFace<SettingsMenuPlanInjected>
  & PropsLocale<'tokenPlan'>

type CardState =
  | { status: 'loading' }
  | { status: 'ready'; summary: TokenPlanAccountSummary | undefined }
  | { status: 'error' }

/**
 * Render the plan/points wallet card.
 * @param props - framework props (seat owner share + inject face + locale).
 * @returns the card, or null while signed out.
 */
export function SettingsMenuPlanCard(props: SettingsMenuPlanCardProps): React.ReactNode {
  const { signedIn, readSummary, openTokenPlan, openPointsRecharge, close, t } = props
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!signedIn()) {
      setState({ status: 'ready', summary: undefined })
      return
    }
    let alive = true
    setState({ status: 'loading' })
    void readSummary().then(
      (summary) => { if (alive) setState({ status: 'ready', summary }) },
      () => { if (alive) setState({ status: 'error' }) },
    )
    return () => { alive = false }
  }, [attempt, readSummary, signedIn])

  const leaveForTokenPlan = useCallback(() => {
    close()
    openTokenPlan()
  }, [close, openTokenPlan])

  // The purchase modal is a shell-owned seat, so the card can only ask for it.
  // The menu leaves first: it is drawn beside the modal, not inside it.
  const buyPoints = useCallback(() => {
    close()
    openPointsRecharge()
  }, [close, openPointsRecharge])

  if (!signedIn()) return null

  const summary = state.status === 'ready' ? state.summary : undefined
  const plan = state.status === 'error' ? '—' : planLabelOf(summary, t)
  const pointsText = summary?.points === undefined ? '—' : formatPointBalance(summary.points)
  const busy = state.status === 'loading'

  return (
    <div
      className={css.card}
      data-testid="settings-menu-plan-card"
      data-state={state.status}
      aria-busy={busy || undefined}
    >
      <div className={css.figures}>
        <div className={css.figure}>
          <span className={css.figureLabel}>{t('menu.plan')}</span>
          {busy
            ? <span className={css.skeleton} data-testid="settings-menu-plan-skeleton" aria-hidden="true" />
            : <span className={css.planValue} title={state.status === 'error' ? t('menu.planUnavailable') : plan}>{plan}</span>}
        </div>
        <div className={css.figure}>
          <span className={css.figureLabel}>
            {t('menu.pointsBalance')}
            {state.status === 'error' && (
              <button type="button" className={css.retry} onClick={() => { setAttempt(value => value + 1) }}>
                {t('menu.planRetry')}
              </button>
            )}
          </span>
          {busy
            ? <span className={css.skeleton} data-testid="settings-menu-points-skeleton" aria-hidden="true" />
            : (
              <span
                className={css.pointsValue}
                title={state.status === 'error' ? t('menu.planUnavailable') : pointsText}
                data-testid="settings-menu-points-value"
              >
                {pointsText}
              </span>
            )}
        </div>
      </div>
      <div className={css.actions}>
        <Button variant="primary" className={css.action} onClick={leaveForTokenPlan}>
          {t('menu.upgrade')}
        </Button>
        <Button variant="outline" className={css.action} onClick={buyPoints}>
          {t('menu.buyPoints')}
        </Button>
      </div>
    </div>
  )
}
