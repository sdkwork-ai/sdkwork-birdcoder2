/** Display formatting shared by the plan/points surfaces. */
import type { TokenPlanKey } from './locales.ts'
import type { TokenPlanAccountSummary } from './token-plan-service.ts'

const POINTS = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const TIME = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

/**
 * Format a point balance without inventing precision the gateway did not send.
 * @param points - the numeric balance.
 * @returns the localized balance text.
 */
export function formatPointBalance(points: number): string {
  return POINTS.format(points)
}

/**
 * Resolve the plan label, with a localized fallback for accounts without a
 * named plan.
 * @param summary - plan facts, or undefined before the read resolves.
 * @param t - token-plan dictionary lookup.
 * @returns the plan name or the member/free fallback.
 */
export function planLabelOf(
  summary: TokenPlanAccountSummary | undefined,
  t: (key: TokenPlanKey) => string,
): string {
  if (summary?.planName !== undefined) return summary.planName
  return summary?.active === true ? t('menu.planMember') : t('menu.planFree')
}

/**
 * Format a ledger change with an explicit direction.
 * @param value - positive for a credit, negative for a debit.
 * @returns the signed localized amount.
 */
export function formatPointsChange(value: number): string {
  if (value > 0) return `+${POINTS.format(value)}`
  if (value < 0) return `-${POINTS.format(Math.abs(value))}`
  return POINTS.format(0)
}

/**
 * Format a gateway timestamp for the activity table.
 * @param value - ISO timestamp, when the gateway supplied one.
 * @returns the localized timestamp, or the raw wire text when unparseable.
 */
export function formatPointsTime(value: string | undefined): string {
  if (value === undefined) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return TIME.format(date)
}

/**
 * Resolve a used/total ratio for a progress bar.
 * @param used - the numerator.
 * @param total - the denominator.
 * @returns a clamped 0-100 percentage.
 */
export function pointsPercent(used: number | undefined, total: number | undefined): number {
  if (used === undefined || total === undefined || total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}
