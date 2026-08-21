/**
 * Durable IAM session helpers for browser restarts: the auth stack validates
 * stored dual-token sessions against `sessions.current.retrieve`, but a failed
 * validation clears localStorage even when the failure is transient. These
 * helpers mirror the sdkwork auth runtime's stored-session rules so ui-sdkwork-iam
 * can hydrate credentials and restore a backed-up session after bootstrap.
 */

import type { SdkworkAuthSession, SdkworkAuthUser } from '@sdkwork/auth-pc-react'
import type { IamStoredSession } from './iam-token-store.ts'

/** Persisted session blob including optional identity fields for fast UI restore. */
export interface IamPersistedSession extends IamStoredSession {
  context?: unknown
  sessionId?: string
  user?: SdkworkAuthUser
}

function normalizeToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function isStoredSessionExpired(session: IamStoredSession): boolean {
  const raw = session.expiresAt
  if (raw === undefined) return false
  const timestamp = typeof raw === 'number' ? raw : Number(raw)
  const resolvedTimestamp = Number.isFinite(timestamp) ? timestamp : Date.parse(String(raw))
  return Number.isFinite(resolvedTimestamp) && Date.now() >= resolvedTimestamp
}

/**
 * Whether the stored blob carries a complete, unexpired dual-token session.
 * @param session - raw localStorage snapshot.
 * @returns true when bootstrap may treat the blob as a signed-in session.
 */
export function isPersistableStoredSession(session: IamStoredSession): session is IamPersistedSession {
  return Boolean(
    normalizeToken(session.authToken)
    && normalizeToken(session.accessToken),
  ) && !isStoredSessionExpired(session)
}

/**
 * Project a persisted blob onto the controller session shape.
 * @param stored - complete stored session.
 * @returns the session for {@link SdkworkAuthController.applySession}, or null.
 */
export function toRestoredAuthSession(stored: IamPersistedSession): SdkworkAuthSession | null {
  const accessToken = normalizeToken(stored.accessToken)
  const authToken = normalizeToken(stored.authToken)
  if (accessToken === undefined || authToken === undefined) return null
  return {
    accessToken,
    authToken,
    ...(stored.expiresAt !== undefined ? { expiresAt: stored.expiresAt } : {}),
    ...(normalizeToken(stored.refreshToken) ? { refreshToken: normalizeToken(stored.refreshToken) } : {}),
    ...(normalizeToken(stored.sessionId) ? { sessionId: normalizeToken(stored.sessionId) } : {}),
    ...(stored.context !== undefined ? { context: stored.context } : {}),
    ...(stored.user ? { user: stored.user } : {}),
  }
}
