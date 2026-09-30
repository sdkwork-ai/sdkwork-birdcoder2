import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionLabel, sessionLinkState } from '../src/client/session-link.ts'

const id = 'session-original' as SessionId

const ready: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }

/** Session list whose Host-list projection is `ids` and whose rows are `byId`. */
function sessions(ids: SessionId[], rows: SessionId[]): SessionListState {
  return {
    ids,
    byId: Object.fromEntries(rows.map(row => [row, {
      id: row, displayTitle: row, running: false, blank: false, updatedAt: 0, retainedBy: {},
    }] as const)),
    phase: 'ready', projectionsBySession: {},
  }
}

/** Session list whose single row for `sessionId` carries `title`, absent when undefined. */
function titled(sessionId: SessionId, title: string | undefined): SessionListState {
  return {
    ids: [sessionId],
    byId: Object.fromEntries([[sessionId, {
      id: sessionId, displayTitle: sessionId, running: false, blank: false, updatedAt: 0, retainedBy: {},
      ...(title === undefined ? {} : { title }),
    }] as const]),
    phase: 'ready', projectionsBySession: {},
  }
}

/** Session lists that hold no usable catalog title for the linked Session. */
const untitled: readonly (readonly [string, SessionListState])[] = [
  ['no row for the Session', sessions([], [])],
  ['a row the catalog has not titled yet', titled(id, undefined)],
  ['a row whose title is blank', titled(id, '   ')],
]

describe('linked Session availability', () => {
  it('accepts a Session the Host list contains', () => {
    expect(sessionLinkState(id, sessions([id], [id]), ready)).toBe('available')
  })

  it('rejects a Session the Host list dropped even while a local fallback row survives', () => {
    // `byId` keeps local fallback rows for live Client generations, so only
    // `ids` expresses Host-list membership.
    const fallback = sessions([], [id])
    expect(fallback.byId[id]).toBeDefined()
    expect(sessionLinkState(id, fallback, ready)).toBe('unavailable')
  })

  it('reports archived and loading ahead of membership', () => {
    expect(sessionLinkState(id, sessions([], []), { ...ready, archivedSessionIds: [id] })).toBe('archived')
    expect(sessionLinkState(id, { ...sessions([], []), phase: 'pending' }, ready)).toBe('loading')
    expect(sessionLinkState(id, sessions([id], [id]), { ...ready, phase: 'pending' })).toBe('loading')
  })

  it('reports unavailable when the Workspace feed failed', () => {
    expect(sessionLinkState(id, sessions([id], [id]), { ...ready, state: 'error' })).toBe('unavailable')
  })
})

describe('linked Session label', () => {
  it('shows the catalog title while the catalog holds one', () => {
    expect(sessionLabel(id, titled(id, 'Morning briefing'))).toEqual({ text: 'Morning briefing', titled: true })
  })

  it.each(untitled)('falls back to the Session id with %s', (_case, list) => {
    expect(sessionLabel(id, list)).toEqual({ text: id, titled: false })
  })
})
