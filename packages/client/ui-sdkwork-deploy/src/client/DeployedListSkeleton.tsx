/**
 * First-read placeholder rows shared by the settings-menu drawer's two
 * ledgers. A list loads as a skeleton of its own row shape, so the drawer does
 * not jump when the rows arrive. The accessible name carries the loading copy;
 * the placeholder bars stay decorative.
 */
import type { ReactNode } from 'react'
import css from './DeployedAppsDialog.module.css'

/** Props for the shared skeleton list. */
export interface DeployedListSkeletonProps {
  /** Localized loading label, also the status region's accessible name. */
  readonly label: string
  /** Placeholder rows to draw; defaults to four, the app ledger's count. */
  readonly rows?: number | undefined
}

/**
 * Render the placeholder list.
 * @param props - the localized loading label and the row count.
 * @returns the skeleton list.
 */
export function DeployedListSkeleton({ label, rows = 4 }: DeployedListSkeletonProps): ReactNode {
  return (
    <div className={css.skeletonList} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_unused, index) => (
        <div key={index} className={css.skeletonRow} aria-hidden="true">
          <span className={css.skeletonAvatar} />
          <span className={css.skeletonMain}>
            <span className={css.skeletonLine} />
            <span className={css.skeletonLineShort} />
          </span>
        </div>
      ))}
    </div>
  )
}
