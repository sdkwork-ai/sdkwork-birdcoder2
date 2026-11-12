/**
 * The failure banner the settings-menu drawer's two ledgers share: the
 * localized cause text and the retry action. A ledger that already has rows
 * keeps them below this banner, so a failed refresh reads as a stale list with
 * an explanation rather than an empty surface.
 */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DeployedAppsDialog.module.css'

/** Props for the shared ledger failure banner. */
export interface DeployedLedgerErrorProps {
  /** Localized failure copy with the cause already interpolated. */
  readonly message: string
  /** Localized retry action label. */
  readonly retryLabel: string
  readonly onRetry: () => void
}

/**
 * Render the failure banner.
 * @param props - the localized copy and the retry callback.
 * @returns the alert row.
 */
export function DeployedLedgerError({ message, retryLabel, onRetry }: DeployedLedgerErrorProps): ReactNode {
  return (
    <div className={css.errorBanner} role="alert">
      <span>{message}</span>
      <Button size="sm" onClick={onRetry}>{retryLabel}</Button>
    </div>
  )
}
