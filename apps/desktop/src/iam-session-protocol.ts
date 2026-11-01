/**
 * Wire contract of the durable IAM session bridge.
 *
 * Kept free of Node built-ins because the Electron preload half imports it:
 * the file I/O lives in `iam-session.ts`, which only the main process loads.
 */

/** IPC channels of the renderer-facing session bridge. */
export const IAM_SESSION_BRIDGE = {
  read: 'sdkwork:iamSession:read',
  save: 'sdkwork:iamSession:save',
  clear: 'sdkwork:iamSession:clear',
} as const

/** Schema version of the persisted record. */
export const IAM_SESSION_VERSION = 1

/** One complete dual-token IAM session as the renderer committed it. */
export interface IamSessionRecord {
  readonly version: number
  readonly authToken: string
  readonly accessToken: string
  readonly refreshToken?: string
  readonly sessionId?: string
  readonly expiresAt?: number | string
  readonly user?: unknown
  readonly context?: unknown
  /** ISO-8601 time this record was written. */
  readonly savedAt: string
}
