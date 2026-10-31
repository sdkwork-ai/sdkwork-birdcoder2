/**
 * The scheduled-task row's immediate actions: whether "run now" is available,
 * and what one run or one lifecycle change settled as.
 *
 * The Host owns the delivery floor, the execution slot, and the archived
 * destination, but it reports each of them on the catalog row, so the list can
 * state why a run is unavailable instead of offering a control that always
 * fails. The vocabulary lives here rather than in the page so the copy, the
 * disabled reason, and the outcome mapping stay one decision.
 */
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Why the run control is unavailable right now. */
export type RunBlock =
  /** A delivery of this task is queued or running; the Host manages it in the conversation. */
  | 'execution'
  /** The minimum delivery interval has not passed yet. */
  | 'floor'
  /** The task's conversation is archived, so the Host refuses a delivery. */
  | 'archived'

/** One row's current run availability. */
export interface RunAvailability {
  /** Whether the run control must be disabled. */
  readonly disabled: boolean
  /** The holding condition, or null when the run is available. */
  readonly blocked: RunBlock | null
  /** End of the minimum delivery interval, present when only the interval holds the run. */
  readonly availableAt?: string
}

/**
 * Whether one task can be run now, and what holds it when it cannot.
 *
 * An active, paused, or ended task can all be run now; only a delivery already
 * in flight, the minimum interval, or an archived destination blocks it. The
 * archived test takes the task's destination Session when one exists, because a
 * `new_once` target that has not delivered yet has none.
 * @param task - catalog row whose run control is rendered.
 * @param archivedSessionIds - Sessions the Workspace catalog reports as archived.
 * @param now - current epoch milliseconds.
 * @returns the control's availability and, for the interval case, its end.
 */
export function runAvailability(
  task: Pick<ScheduleCatalogEntry, 'target' | 'lastDelivery' | 'executionActive' | 'deliveryFloorEndsAt'>,
  archivedSessionIds: readonly SessionId[],
  now: number,
): RunAvailability {
  if (task.executionActive === true) return { disabled: true, blocked: 'execution' }
  const floorEndsAt = task.deliveryFloorEndsAt
  if (floorEndsAt !== undefined && Date.parse(floorEndsAt) > now) {
    return { disabled: true, blocked: 'floor', availableAt: floorEndsAt }
  }
  const destination = task.target.kind === 'new' ? task.lastDelivery?.targetSessionId : task.target.sessionId
  if (destination !== undefined && archivedSessionIds.includes(destination)) {
    return { disabled: true, blocked: 'archived' }
  }
  return { disabled: false, blocked: null }
}

/** The code one refused run states. */
export type RunRefusal =
  /** A delivery of this task is already queued or running. */
  | 'pending'
  /** The task row the Host was asked for no longer exists. */
  | 'missing'
  /** The destination Session is archived, so the Host refused the delivery. */
  | 'archived'
  /** Transport or unclassified Host failure. */
  | 'failed'

/** What one run-now request settled as. */
export type RunTaskOutcome =
  | { readonly queued: true }
  | { readonly queued: false; readonly code: RunRefusal }

/** What one enable or disable request settled as. */
export type SetActiveOutcome =
  | { readonly saved: true }
  /** The Host refused the change; the stored lifecycle state did not move. */
  | { readonly saved: false }
