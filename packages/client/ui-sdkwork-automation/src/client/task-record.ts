/**
 * Catalog vocabulary the Automation panel derives from one Host task.
 *
 * The Host stores a task's destination as a `target` rather than as "the
 * Session this task belongs to": an existing Session, a reserved Session the
 * first delivery creates, or a fresh Session per delivery. The panel asks the
 * three questions that difference raises — which Session to link, whether a
 * Session is involved at all, and which destination label to show — here, so
 * every surface answers them the same way.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { AutomationKey } from './locales.ts'

/**
 * Session the task's deliveries land in, when one exists.
 *
 * A `new` target creates its Session at delivery time, so before the first
 * delivery it names none; afterwards the latest receipt does.
 * @param task - task whose conversation link is shown.
 * @returns destination identity, or undefined for a not-yet-delivered `new` target.
 */
export function taskSessionId(task: Pick<ScheduleCatalogEntry, 'target' | 'lastDelivery'>): SessionId | undefined {
  return task.target.kind === 'new' ? task.lastDelivery?.targetSessionId : task.target.sessionId
}

/**
 * Whether one Session is bound to this task, as destination or otherwise.
 *
 * A detail hosted inside an involved Session omits its own link, and the Host
 * keeps notifying involved Sessions of later changes, so the test is broader
 * than {@link taskSessionId}.
 * @param task - task being shown.
 * @param sessionId - Session hosting the detail.
 * @returns whether the task targets or involves this Session.
 */
export function taskInvolvesSession(
  task: Pick<ScheduleCatalogEntry, 'target' | 'lastDelivery' | 'involvedSessionIds'>,
  sessionId: SessionId,
): boolean {
  return task.involvedSessionIds.includes(sessionId) || taskSessionId(task) === sessionId
}

/**
 * Dictionary key naming where the task delivers.
 * @param task - task being shown.
 * @returns key of the destination label.
 */
export function taskTargetKey(task: Pick<ScheduleCatalogEntry, 'target'>): AutomationKey {
  switch (task.target.kind) {
    case 'session': return 'target.session'
    case 'new_once': return 'target.newOnce'
    case 'new': return 'target.new'
  }
}
