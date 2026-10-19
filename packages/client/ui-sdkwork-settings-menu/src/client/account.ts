/**
 * The account service the settings menu renders: a snapshot source for the
 * menu's account group (username header, membership/points rows, the sign-in
 * row while signed out) plus the sign-in and sign-out gestures. The shipped
 * provider is the anonymous state — signed out, carrying no membership or
 * points — which the menu renders without an account identity header (the
 * sign-in row carries the signed-out surface) and with a disabled sign-out
 * row. The account identity header and the sign-in row are mutually
 * exclusive: the header renders only while signed in.
 * The ui-sdkwork-iam plugin replaces the source behind the same face through
 * `setSource`; the menu keeps consuming the snapshot contract untouched.
 */

/** Signed-in account profile; the anonymous default carries no facts. */
export interface AccountProfile {
  /** Whether a user is signed in; false renders the anonymous menu state. */
  signedIn: boolean
  /** Display name (undefined while signed out). */
  username?: string
  /** Membership level label (undefined while signed out). */
  membership?: string
  /** Points balance (undefined while signed out). */
  points?: number
  /** Whether a sign-in gesture exists; true renders the menu's sign-in row while signed out. */
  signInAvailable?: boolean
}

/**
 * One account backend behind the runtime's snapshot face. The anonymous
 * default is a static profile; a real backend (the ui-sdkwork-iam plugin) publishes
 * the authenticated profile, ends the session, and starts the sign-in flow
 * in whatever presentation it owns.
 */
export interface AccountSource {
  /** @returns the current profile (stable reference until the source moves). */
  getSnapshot(): AccountProfile
  /** Observe snapshot replacements. */
  subscribe(listener: () => void): () => void
  /** End the session; the anonymous provider has no session to end. */
  logout(): Promise<void> | void
  /** Start the sign-in flow; the anonymous provider has no flow to start. */
  signIn(): Promise<void> | void
}

const ANONYMOUS_PROFILE: AccountProfile = { signedIn: false }

const ANONYMOUS_SOURCE: AccountSource = {
  getSnapshot: () => ANONYMOUS_PROFILE,
  subscribe: () => () => {},
  logout: () => {},
  signIn: () => {},
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    account: AccountRuntime
  }
}

/**
 * Account runtime: stable snapshot source and the sign-in/sign-out gestures.
 * The default source is the anonymous profile; a backend swaps it through
 * `setSource`, so the menu consumes one snapshot contract in both states.
 */
export class AccountRuntime {
  private source: AccountSource = ANONYMOUS_SOURCE
  /** One disposer per subscriber, rebound onto the active source on every swap. */
  private readonly subscriptions = new Map<() => void, () => void>()

  /**
   * The current profile snapshot.
   * @returns the current profile (stable reference until a provider changes it).
   */
  getSnapshot(): AccountProfile {
    return this.source.getSnapshot()
  }

  /**
   * Observe snapshot replacements.
   * @param listener - the change listener.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    // A repeated subscription keeps one source edge, so a later swap cannot
    // leave a duplicate behind for the same listener.
    this.subscriptions.get(listener)?.()
    this.subscriptions.set(listener, this.source.subscribe(listener))
    return () => {
      // Read the disposer at call time: a swap replaces it under the same
      // listener, and the caller's original unsubscribe must still detach.
      const dispose = this.subscriptions.get(listener)
      if (dispose === undefined) return
      this.subscriptions.delete(listener)
      dispose()
    }
  }

  /** End the session through the active source. */
  async logout(): Promise<void> {
    return this.source.logout()
  }

  /** Start the sign-in flow through the active source (no-op while anonymous). */
  async signIn(): Promise<void> {
    return this.source.signIn()
  }

  /**
   * Swap the account backend. Every live subscriber moves to the replacement
   * and re-reads it immediately: a feature plugin can be reloaded without
   * stranding the menu subscription on the outgoing service, and the
   * replacement's snapshot may already differ from the one on screen.
   * @param source - the backend replacing the current one.
   */
  setSource(source: AccountSource): void {
    if (source === this.source) return
    for (const dispose of this.subscriptions.values()) dispose()
    this.source = source
    for (const listener of this.subscriptions.keys()) {
      this.subscriptions.set(listener, source.subscribe(listener))
    }
    for (const listener of this.subscriptions.keys()) listener()
  }
}
