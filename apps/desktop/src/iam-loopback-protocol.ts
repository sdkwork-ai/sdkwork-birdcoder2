/**
 * IPC contract for the RFC 8252 loopback login redirect.
 *
 * The main process owns the loopback listener (only it can bind a socket); the
 * renderer asks for a redirect URI, opens the browser, and receives the
 * callback URL on the event channel. Kept free of Node built-ins because the
 * preload half imports it.
 */

/** Channels of the loopback login bridge. */
export const IAM_LOOPBACK_BRIDGE = {
  start: 'sdkwork:loopback:start',
  cancel: 'sdkwork:loopback:cancel',
  callback: 'sdkwork:loopback:callback',
} as const

/** One loopback redirect returned by the main process. */
export interface IamLoopbackStartResult {
  /** Absolute `http://127.0.0.1:<port>/auth/callback` for the authorize request. */
  redirectUri: string
}

/** Renderer-facing loopback login controls. */
export interface IamLoopbackLoginBridge {
  /** Start a listener; starting again replaces the previous one. */
  start(): Promise<IamLoopbackStartResult>
  /** Stop the pending listener. */
  cancel(): Promise<void>
  /** Subscribe to accepted callback URLs; returns the unsubscribe function. */
  onCallback(handler: (url: string) => void): () => void
}
