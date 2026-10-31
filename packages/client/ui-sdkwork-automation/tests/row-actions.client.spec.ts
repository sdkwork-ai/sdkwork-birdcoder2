/**
 * Row-action state spec: whether one catalog row may run now, which condition
 * holds it, and how the task's own conversation decides the archived case.
 */
import { describe, expect, it } from 'vitest'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { runAvailability } from '../src/client/row-actions.ts'

const DESTINATION = 'session-destination' as SessionId
const NOW = Date.parse('2026-10-01T08:00:00.000Z')

/** One idle one-shot delivering into an existing Session. */
const base: ScheduleCatalogEntry = {
  id: 'task-1' as ScheduleCatalogEntry['id'],
  kind: 'at',
  title: 'Task',
  prompt: 'Prompt',
  scheduledAt: '2026-10-01T09:00:00.000Z',
  target: { kind: 'session', sessionId: DESTINATION },
  involvedSessionIds: [DESTINATION],
  status: 'active',
}

/**
 * One catalog row whose destination is an existing Session unless a case
 * overrides a field; the cast keeps the row's kind-specific fields checkable at
 * each case's own literal rather than through a partial of the whole union.
 * @param over - fields the case replaces.
 * @returns the catalog row under test.
 */
function task(over: Partial<ScheduleCatalogEntry> = {}): ScheduleCatalogEntry {
  return { ...base, ...over } as ScheduleCatalogEntry
}

describe('runAvailability', () => {
  it('offers run-now for an idle task whose conversation is available', () => {
    expect(runAvailability(task(), [], NOW)).toEqual({ disabled: false, blocked: null })
  })

  it('holds the run while a delivery of the task is queued or running', () => {
    expect(runAvailability(task({ executionActive: true }), [], NOW))
      .toEqual({ disabled: true, blocked: 'execution' })
  })

  it('holds the run until the minimum delivery interval ends and names that end', () => {
    const floor = '2026-10-01T08:00:30.000Z'
    expect(runAvailability(task({ deliveryFloorEndsAt: floor }), [], NOW))
      .toEqual({ disabled: true, blocked: 'floor', availableAt: floor })
    // A floor that already passed holds nothing.
    expect(runAvailability(task({ deliveryFloorEndsAt: '2026-10-01T07:59:59.000Z' }), [], NOW))
      .toEqual({ disabled: false, blocked: null })
  })

  it('holds the run when the task’s conversation is archived', () => {
    expect(runAvailability(task(), [DESTINATION], NOW)).toEqual({ disabled: true, blocked: 'archived' })
    // An archive of some other Session says nothing about this task.
    expect(runAvailability(task(), ['another' as SessionId], NOW)).toEqual({ disabled: false, blocked: null })
  })

  it('reads the destination of a per-run task from its latest delivery', () => {
    const delivered = task({
      target: { kind: 'new', create: {} },
      lastDelivery: {
        scheduledAt: '2026-10-01T07:00:00.000Z',
        deliveredAt: '2026-10-01T07:00:00.000Z',
        messageId: 'message-1' as never,
        targetSessionId: DESTINATION,
      },
    })
    expect(runAvailability(delivered, [DESTINATION], NOW)).toEqual({ disabled: true, blocked: 'archived' })
    // Before its first delivery the row names no conversation, so nothing is archived.
    expect(runAvailability(task({ target: { kind: 'new', create: {} } }), [DESTINATION], NOW))
      .toEqual({ disabled: false, blocked: null })
  })
})
