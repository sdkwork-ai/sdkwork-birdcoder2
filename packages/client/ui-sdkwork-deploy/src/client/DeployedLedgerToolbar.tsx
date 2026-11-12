/**
 * The facet toolbar the settings-menu drawer's two ledgers share: the localized
 * facet label, the OR-selection chips with their counts, the clear action, the
 * shown/total summary, and the refresh button.
 *
 * It stays presentation-only: the panels own selection state and pass plain
 * data and callbacks, so the two inventories keep their own models while the
 * row above the list reads identically.
 */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DeployedAppsDialog.module.css'

/** One facet chip: the value it toggles, its localized label, and its count. */
export interface DeployedLedgerChip {
  /** Stable identity for the chip (the kind or status it filters by). */
  readonly id: string
  readonly label: string
  readonly count: number
  readonly pressed: boolean
  readonly onToggle: () => void
}

/** Props for the shared ledger toolbar. */
export interface DeployedLedgerToolbarProps {
  /** Localized facet label, also the chip group's accessible name. */
  readonly label: string
  readonly chips: readonly DeployedLedgerChip[]
  /** Clear action; absent while the facet selection is empty. */
  readonly clear?: { readonly label: string; readonly onClick: () => void } | undefined
  /** Localized shown/total summary. */
  readonly summary: string
  /** True while a read is running; the refresh action is disabled then. */
  readonly busy: boolean
  readonly refreshLabel: string
  readonly onRefresh: () => void
}

/**
 * Render the toolbar above one ledger.
 * @param props - the facet data, the optional clear action, and the refresh state.
 * @returns the toolbar row.
 */
export function DeployedLedgerToolbar({
  label, chips, clear, summary, busy, refreshLabel, onRefresh,
}: DeployedLedgerToolbarProps): ReactNode {
  return (
    <div className={css.toolbar}>
      <span className={css.facetLabel}>{label}</span>
      <div className={css.chips} role="group" aria-label={label}>
        {chips.map(chip => (
          <button
            key={chip.id}
            type="button"
            className={css.chip}
            aria-pressed={chip.pressed}
            onClick={chip.onToggle}
          >
            {chip.label}
            <span className={css.chipCount}>{chip.count}</span>
          </button>
        ))}
      </div>
      {clear !== undefined && (
        <button type="button" className={css.clear} onClick={clear.onClick}>
          {clear.label}
        </button>
      )}
      <span className={css.summary} aria-live="polite">{summary}</span>
      <Button size="sm" disabled={busy} onClick={onRefresh}>{refreshLabel}</Button>
    </div>
  )
}
