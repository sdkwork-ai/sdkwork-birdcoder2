/**
 * Points purchase modal opened by the settings-menu wallet card's top-up
 * action.
 *
 * The shell renders it on the `settings.pointsRecharge` seat and owns its
 * visibility, so the surface outlives the popover that asked for it: a top-up
 * is a package picker plus a QR payment that settles on its own clock, while
 * the popover unmounts everything it holds the moment it closes.
 *
 * The modal reads the wallet for its header balance and re-reads it once a
 * payment lands, so the figure the user sees after paying is the settled one
 * rather than the pre-purchase snapshot. The wallet card itself re-reads the
 * wallet every time the popover mounts it, so the next menu open shows the
 * same settled balance.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { SdkworkPointsRechargeDialog } from '@sdkwork/order-pc-recharge'
import type { SdkworkPointsRechargeService } from '@sdkwork/order-pc-recharge'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the 'settings.pointsRecharge' owner share into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { pointsRechargeCopy } from './recharge-copy.ts'
import { roundPointBalance } from './points-format.ts'
import css from './TokenPlanDialogs.module.css'
import './pointsRechargeTheme.css'

/** Injected business face of the points purchase modal. */
export interface PointsRechargeDialogInjected {
  /**
   * The points-recharge port this modal drives, or undefined when the active
   * deployment has no API environment to serve it. Read lazily: the seat is
   * mounted with the settings menu, and constructing SDK clients for a modal
   * nobody opened would run on every menu render.
   */
  readService: () => SdkworkPointsRechargeService | undefined
  /** Read the Token Bank account's current balance for the header. */
  readBalance: () => Promise<number | undefined>
}

/** Full props: the seat owner share, the injected commerce face, and the locale seat. */
export type PointsRechargeDialogProps =
  PropsRuntime<'settings.pointsRecharge'>
  & InjectFace<PointsRechargeDialogInjected>
  & PropsLocale<'tokenPlan'>

/**
 * Render the points purchase modal.
 * @param props - framework props (seat owner share + inject face + locale).
 * @returns the modal, or null while the shell has it closed.
 */
export function PointsRechargeDialog(props: PointsRechargeDialogProps): React.ReactNode {
  // Mounted only while open: the wallet read and the Order port belong to one
  // purchase attempt, and the popover that opens this modal is gone by then.
  if (!props.open) return null
  return <OpenPointsRechargeDialog {...props} />
}

/**
 * The open purchase modal: resolve the Order port once per opening, then hand
 * the purchase itself to the Order-owned recharge dialog.
 * @param props - open seat owner share, inject face, and locale seat.
 * @returns the recharge dialog, or the unconfigured notice.
 */
function OpenPointsRechargeDialog({
  onClose,
  readBalance,
  readService,
  t,
}: Omit<PointsRechargeDialogProps, 'open'>) {
  const [service] = useState(() => readService())
  const [points, setPoints] = useState<number | null>(null)

  const readCurrentPoints = useCallback(async () => {
    try {
      const balance = await readBalance()
      // The Order dialog prints the number it receives, so the four-decimal
      // balance has to be rounded before it crosses that boundary.
      setPoints(balance === undefined ? null : roundPointBalance(balance))
    } catch {
      // The header keeps the last balance it showed: the purchase runs through
      // the Order service and does not depend on this read.
    }
  }, [readBalance])

  useEffect(() => { void readCurrentPoints() }, [readCurrentPoints])

  // Settlement is the commit point: the Order dialog has already polled the
  // payment to `completed` when it calls this, so the wallet re-read reflects
  // the credited points.
  const onCompleted = useCallback(async () => { await readCurrentPoints() }, [readCurrentPoints])

  if (service === undefined) {
    return (
      <Modal
        className={css.detailsDialog}
        closeLabel={t('recharge.close')}
        footer={<Button onClick={onClose} type="button" variant="primary">{t('pointsDetails.done')}</Button>}
        onClose={onClose}
        open
        title={t('recharge.title')}
      >
        <div className={css.content}>
          <p className={css.hint}>{t('page.unconfigured')}</p>
        </div>
      </Modal>
    )
  }

  return (
    <SdkworkPointsRechargeDialog
      copy={pointsRechargeCopy(t)}
      currentPoints={points}
      isOpen
      onClose={onClose}
      onCompleted={onCompleted}
      service={service}
    />
  )
}
