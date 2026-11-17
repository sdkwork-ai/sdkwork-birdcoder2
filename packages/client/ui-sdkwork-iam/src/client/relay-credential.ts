/**
 * Mirror the signed-in IAM token into the Host credential plane.
 *
 * BirdCoder's relay accepts the IAM `authToken` as its API key, and the Host
 * plugin that turns a session into a relay credential reads the desktop shell's
 * session files (`<DSH_HOME>/iam/*`). A product launch with no desktop shell —
 * the browser build, or any deployment that serves the web app on its own —
 * writes no such files, so the token the page already holds would never reach
 * the request that needs it. This mirror writes it into a dedicated credential
 * reference instead, and removes it on sign-out.
 *
 * The reference is a SESSION source, never the relay's own key: the Host plugin
 * mirrors it into `BIRDCODER_API_KEY` only while no user key holds that
 * reference, so an API key the user enters on the Models page always wins and
 * is never overwritten by a later token refresh.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-iam/relay-credential
 */

/**
 * Credential reference the signed-in `authToken` is mirrored under. The Host
 * `birdcoder-account` plugin reads the same default; both spell it
 * `BIRDCODER_AUTH_TOKEN` and neither treats it as the relay's API key.
 */
export const BIRDCODER_SESSION_CREDENTIAL_REF = 'BIRDCODER_AUTH_TOKEN'

/** Credential writes the mirror performs through the Host Remote. */
export interface RelayCredentialOperations {
  /** Store one credential literal under its reference. */
  set(ref: string, value: string): Promise<{ readonly ok: boolean }>
  /** Remove one credential reference. */
  unset(ref: string): Promise<{ readonly ok: boolean }>
}

/** Inputs the mirror reads and the writes it performs. */
export interface RelayCredentialMirrorOptions {
  /** The session's login token, or undefined while signed out. */
  authToken: () => string | undefined
  /** Observe credential changes; returns the disposer removing the listener. */
  subscribe: (listener: () => void) => () => void
  /** The Host credential writes. */
  credentials: RelayCredentialOperations
  /** Diagnostic sink for a refused write; defaults to the console. */
  log?: (message: string, error: unknown) => void
}

/**
 * Keep the Host credential reference equal to the session's token.
 *
 * Writes are serialized so a slow round trip cannot overtake a newer session.
 * A signed-out mount clears a reference a previous page left behind, then stops
 * re-issuing that removal until a token arrives; a refused write restores the
 * state so the next session event retries it. Disposal stops future writes at
 * the next settlement and cannot cancel a request already in flight.
 *
 * @param options - token source, change subscription, and credential writes.
 * @returns the teardown removing the subscription and stopping future writes.
 */
export function startRelayCredentialMirror(options: RelayCredentialMirrorOptions): () => void {
  const log = options.log ?? ((message: string, error: unknown) => {
    console.warn(message, error)
  })
  // The token this page last mirrored, and whether the reference was already
  // cleared: a signed-out mount clears a reference a previous page left behind,
  // and a signed-out state then stops re-issuing that removal on every change.
  let mirrored: string | undefined
  let cleared = false
  let pending: Promise<void> = Promise.resolve()
  let disposed = false

  const run = async (): Promise<void> => {
    if (disposed) return
    const token = options.authToken()
    if (token === undefined) {
      if (mirrored === undefined && cleared) return
      mirrored = undefined
      cleared = true
      const response = await options.credentials.unset(BIRDCODER_SESSION_CREDENTIAL_REF)
      if (!response.ok) {
        cleared = false
        log('ui-sdkwork-iam: could not clear the mirrored relay session credential', response)
      }
      return
    }
    cleared = false
    if (token === mirrored) return
    mirrored = token
    const response = await options.credentials.set(BIRDCODER_SESSION_CREDENTIAL_REF, token)
    if (!response.ok) {
      mirrored = undefined
      log('ui-sdkwork-iam: could not mirror the signed-in session credential', response)
    }
  }

  const sync = (): void => {
    pending = pending.then(run, run)
  }

  const off = options.subscribe(sync)
  sync()
  return () => {
    disposed = true
    off()
  }
}
