/**
 * Settings-center "套餐与积分" page: the account's plan, remaining compute
 * points, wallet split, and recent points ledger.
 *
 * The page reads the same Membership service as the Token Plan catalog and the
 * settings-menu wallet card, so the figures agree across all three surfaces.
 * It is a settings section rather than a second modal: the settings center is
 * already the modal, and the nav rail is where users look for account facts.
 */

import { useCallback, useEffect, useState } from 'react'
import { BirdLogo, Button, IconInfoOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the 'settings.section' owner share into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TokenPlanPointsHistoryEntry, TokenPlanPointsSnapshot } from './token-plan-service.ts'
import { formatPointBalance, formatPointsChange, formatPointsTime, planLabelOf, pointsPercent } from './points-format.ts'
import css from './SettingsPointsSection.module.css'

/** Injected business face of the balances page. */
export interface SettingsPointsSectionInjected {
  /** Read the plan, wallet split, and recent ledger. */
  readPoints: () => Promise<TokenPlanPointsSnapshot | undefined>
  /** Leave settings for the Token Plan catalog. */
  openTokenPlan: () => void
  /** Raise the in-app sign-in surface. */
  signIn: () => void
  /** Live session fact, so a finished sign-in swaps the page immediately. */
  hooks: {
    signedIn: HostObservable<boolean>
  }
}

/** Full props: settings-section owner share, injected commerce face, and locale seat. */
export type SettingsPointsSectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<SettingsPointsSectionInjected>
  & PropsLocale<'tokenPlan'>

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: TokenPlanPointsSnapshot | undefined }
  | { status: 'error' }

type DetailTab = 'overview' | 'history'

/**
 * Render one progress row (label, current/total, bar).
 * @param props.label - localized row label.
 * @param props.value - current amount.
 * @param props.total - total amount used as the bar denominator.
 * @param props.t - locale lookup.
 * @returns the row.
 */
function ProgressRow({
  label, value, total,
}: {
  label: string
  value: number | undefined
  total: number | undefined
}) {
  const percent = pointsPercent(value, total)
  return (
    <div className={css.progressRow}>
      <div className={css.progressHead}>
        <span className={css.progressLabel}>{label}</span>
        <span className={css.progressValue}>
          {value === undefined ? '—' : formatPointBalance(value)}
          {total === undefined ? null : <span className={css.progressTotal}> / {formatPointBalance(total)}</span>}
        </span>
      </div>
      <div
        className={css.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <span className={css.progressFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/**
 * Render one ledger row.
 * @param props.entry - the points-history entry.
 * @returns a table row.
 */
function HistoryRow({ entry }: { entry: TokenPlanPointsHistoryEntry }) {
  const description = entry.remark ?? entry.sourceType
  return (
    <div className={css.historyRow}>
      <div className={css.historyMain}>
        <span className={css.historyDescription}>{description ?? '—'}</span>
        <span className={css.historyTime}>{formatPointsTime(entry.createdAt)}</span>
      </div>
      <span className={entry.changeAmount > 0 ? css.historyCredit : css.historyDebit}>
        {formatPointsChange(entry.changeAmount)}
      </span>
      <span className={css.historyBalance}>
        {entry.afterBalance === undefined ? '—' : formatPointBalance(entry.afterBalance)}
      </span>
    </div>
  )
}

/**
 * Render the settings balances section.
 * @param props - framework props (section owner share + inject face + locale).
 * @returns the account plan and points page.
 */
export function SettingsPointsSection(props: SettingsPointsSectionProps): React.ReactNode {
  const { useSignedIn, readPoints, openTokenPlan, signIn, close, t } = props
  const signedIn = useSignedIn(value => value)
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<DetailTab>('overview')

  useEffect(() => {
    if (!signedIn) {
      setState({ status: 'ready', snapshot: undefined })
      return
    }
    let alive = true
    setState({ status: 'loading' })
    void readPoints().then(
      (snapshot) => { if (alive) setState({ status: 'ready', snapshot }) },
      () => { if (alive) setState({ status: 'error' }) },
    )
    return () => { alive = false }
  }, [attempt, readPoints, signedIn])

  const leaveForTokenPlan = useCallback(() => {
    close()
    openTokenPlan()
  }, [close, openTokenPlan])

  if (!signedIn) {
    return (
      <section className={css.section} aria-label={t('settings.nav')}>
        <div className={css.signedOut}>
          <BirdLogo size={40} className={css.signedOutLogo} />
          <h2 className={css.signedOutTitle}>{t('settings.points.signedOutTitle')}</h2>
          <p className={css.signedOutDescription}>{t('settings.points.signedOutDescription')}</p>
          <Button variant="primary" onClick={signIn}>{t('settings.points.signIn')}</Button>
        </div>
      </section>
    )
  }

  if (state.status === 'loading') {
    return (
      <section className={css.section} aria-label={t('settings.nav')} aria-busy="true">
        <div className={css.planCard}>
          <div className={css.planCopy}>
            <span className={css.skeletonName} />
            <span className={css.skeletonLine} />
          </div>
        </div>
        <div className={css.balanceCard}>
          <span className={css.skeletonPoints} />
          <span className={css.skeletonLineShort} />
        </div>
        <div className={css.detailsCard}>
          <span className={css.skeletonLine} />
          <span className={css.skeletonLine} />
          <span className={css.skeletonLineShort} />
        </div>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className={css.section} aria-label={t('settings.nav')}>
        <div className={css.errorCard} role="status">
          <p className={css.errorText}>{t('settings.points.loadFailed')}</p>
          <Button variant="outline" onClick={() => { setAttempt(value => value + 1) }}>
            {t('settings.points.retry')}
          </Button>
        </div>
      </section>
    )
  }

  const snapshot = state.snapshot
  const plan = planLabelOf(snapshot, t)
  const total = snapshot?.points
  const available = snapshot?.available
  const frozen = snapshot?.frozen
  const history = snapshot?.history ?? []

  return (
    <section className={css.section} aria-label={t('settings.nav')}>
      <div className={css.planCard}>
        <div className={css.planCopy}>
          <span className={css.planName}>{plan}</span>
          <span className={css.planDescription}>{t('settings.planDescription')}</span>
        </div>
        <Button variant="primary" onClick={leaveForTokenPlan}>{t('menu.upgrade')}</Button>
      </div>

      <div className={css.balanceCard}>
        <div className={css.balanceHero}>
          <span className={css.balanceValue}>{total === undefined ? '—' : formatPointBalance(total)}</span>
          <span className={css.balanceLabel}>{t('settings.points.total')}</span>
          <span
            className={css.info}
            role="img"
            title={t('settings.points.totalHint')}
            aria-label={t('settings.points.totalHint')}
          >
            <IconInfoOutlineRegular size={14} />
          </span>
        </div>
        <div className={css.splitGrid}>
          <div className={css.splitItem}>
            <span className={css.splitLabel}>{t('settings.points.available')}</span>
            <span className={css.splitValue}>{available === undefined ? '—' : formatPointBalance(available)}</span>
          </div>
          <div className={css.splitItem}>
            <span className={css.splitLabel}>{t('settings.points.frozen')}</span>
            <span className={css.splitValue}>{frozen === undefined ? '—' : formatPointBalance(frozen)}</span>
          </div>
        </div>
        <div className={css.brandRow}>
          <BirdLogo size={20} />
          <span>{t('settings.points.usage')}</span>
        </div>
      </div>

      <h3 className={css.detailsTitle}>{t('settings.points.details')}</h3>
      <div className={css.detailsCard}>
        <div className={css.tabs} role="tablist" aria-label={t('settings.points.details')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'overview'}
            className={tab === 'overview' ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => { setTab('overview') }}
          >
            {t('settings.points.overview')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={tab === 'history' ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => { setTab('history') }}
          >
            {t('settings.points.history')}
          </button>
        </div>
        {tab === 'overview'
          ? (
            <div className={css.progressList} role="tabpanel">
              <ProgressRow label={t('settings.points.available')} value={available} total={total} />
              <ProgressRow label={t('settings.points.frozen')} value={frozen} total={total} />
            </div>
          )
          : (
            <div className={css.history} role="tabpanel">
              {history.length === 0
                ? <p className={css.empty}>{t('settings.points.empty')}</p>
                : (
                  <>
                    <div className={css.historyHead}>
                      <span>{t('settings.points.remark')} · {t('settings.points.time')}</span>
                      <span>{t('settings.points.amount')}</span>
                      <span>{t('settings.points.balance')}</span>
                    </div>
                    {history.map(entry => <HistoryRow key={entry.id} entry={entry} />)}
                  </>
                )}
            </div>
          )}
      </div>
    </section>
  )
}
