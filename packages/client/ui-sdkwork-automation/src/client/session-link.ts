/** Original-Session link label and availability from the current public Session and Workspace feeds. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Navigation state shown beside the retained task's original Session id. */
export type SessionLinkState = 'available' | 'loading' | 'archived' | 'unavailable'

/**
 * Session-list projection this link reads.
 *
 * A structural slice rather than one face's state: the browser builds two
 * Session-list contracts (the runtime's and the API controller's) and both are
 * mounted depending on the composition, so the link names only the fields it
 * reads and either snapshot satisfies it.
 */
export interface SessionLinkSessions {
  /** Host list order; membership comes from here, never from `byId`. */
  readonly ids: readonly SessionId[]
  /** Arrival lifecycle; `'pending'` means the list has not answered yet. */
  readonly phase: string
  /** Catalog rows and retained local fallbacks, keyed by Session id. */
  readonly byId: Readonly<Record<SessionId, { readonly title?: string | undefined } | undefined>>
}

/** Workspace projection this link reads, as a structural slice of either face. */
export interface SessionLinkWorkspaces {
  /** Baseline read state; `'error'` means the catalog could not be read. */
  readonly state: string
  /** Arrival lifecycle; `'pending'` means the catalog has not answered yet. */
  readonly phase: string
  /** Sessions the registry reports as archived. */
  readonly archivedSessionIds: readonly SessionId[]
}

/**
 * Check Host-list membership and archive state without activating or restoring anything.
 *
 * `byId` also carries local fallback rows for live Client generations, so
 * membership comes from `ids`, the Host-list projection: a Session the Host list
 * dropped reports unavailable even while a local row for it survives.
 * @param id - Original Session bound to the task.
 * @param sessions - Current Session list projection.
 * @param workspaces - Current Workspace and archive projection.
 * @returns availability or the reason navigation is disabled.
 */
export function sessionLinkState(id: SessionId, sessions: SessionLinkSessions, workspaces: SessionLinkWorkspaces): SessionLinkState {
  if (workspaces.state === 'error') return 'unavailable'
  if (sessions.phase === 'pending' || workspaces.phase === 'pending') return 'loading'
  if (workspaces.archivedSessionIds.includes(id)) return 'archived'
  if (!sessions.ids.includes(id)) return 'unavailable'
  return 'available'
}

/** Label one linked Session shows, and whether a Session title produced it. */
export interface SessionLabel {
  /** Session title from the current catalog, otherwise the Session id. */
  readonly text: string
  /** Whether a catalog title produced {@link SessionLabel.text}; false when the id is shown instead. */
  readonly titled: boolean
}

/**
 * Resolve the label of one linked Session from the Session catalog the calling
 * component already projects.
 *
 * A catalog title renders as-is; the Session id renders while the catalog holds
 * no row for the Session (missing or not yet loaded) or its row carries a blank
 * title, so the label is never empty. Every surface that names a linked Session
 * resolves the label here, so the Automation tasks rows, the task detail, and the
 * task tab all name the same Session the same way.
 * @param id - Original Session bound to the task.
 * @param sessions - Current Session list projection.
 * @returns the resolved label and whether a catalog title produced it.
 */
export function sessionLabel(id: SessionId, sessions: SessionLinkSessions): SessionLabel {
  const title = sessions.byId[id]?.title
  if (title === undefined || title.trim() === '') return { text: id, titled: false }
  return { text: title, titled: true }
}
