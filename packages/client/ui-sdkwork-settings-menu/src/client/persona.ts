/**
 * The persona seam the settings menu renders: whether the persona feature is
 * mounted, the localized label of the chosen role, and the gesture that opens
 * the picker. The shipped provider is the unavailable default — the settings
 * menu must render with or without the persona plugin, and its injected face is
 * assembled once at apply time, so activation order cannot decide whether the
 * row exists. The ui-sdkwork-persona plugin installs a real source through
 * `setSource` and gets a disposer that restores the default when it unloads.
 */

/** What the menu row shows for the current persona state. */
export interface PersonaMenuProfile {
  /** Whether the persona section is served and editable (the row renders only then). */
  available: boolean
  /** Localized label of the chosen role; undefined while unchosen. */
  roleLabel?: string
}

/** One persona backend behind the runtime's snapshot face. */
export interface PersonaMenuSource {
  /** @returns the current profile (stable reference until the source moves). */
  getSnapshot(): PersonaMenuProfile
  /** Observe snapshot replacements. */
  subscribe(listener: () => void): () => void
  /** Open the picker (no-op while the source owns no presentation). */
  open(): void
}

const UNAVAILABLE_PROFILE: PersonaMenuProfile = { available: false }

/** The shipped default: no persona feature mounted, so no row. */
const ABSENT_SOURCE: PersonaMenuSource = {
  getSnapshot: () => UNAVAILABLE_PROFILE,
  subscribe: () => () => {},
  open: () => {},
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    persona: PersonaRuntime
  }
}

/**
 * Persona runtime: a stable snapshot source plus the picker gesture. The
 * default source is unavailable; the persona plugin swaps it through
 * `setSource`, so the menu consumes one snapshot contract in both states.
 */
export class PersonaRuntime {
  private source: PersonaMenuSource = ABSENT_SOURCE
  /** One disposer per subscriber, rebound onto the active source on every swap. */
  private readonly subscriptions = new Map<() => void, () => void>()

  /**
   * The current profile snapshot.
   * @returns the current profile (stable reference until a provider changes it).
   */
  getSnapshot(): PersonaMenuProfile {
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

  /** Open the persona picker through the active source (no-op while absent). */
  open(): void {
    this.source.open()
  }

  /**
   * Swap the persona backend. Every live subscriber moves to the replacement
   * and re-reads it immediately, so a reloaded persona plugin never strands the
   * menu on the outgoing source.
   * @param source - the backend replacing the current one.
   * @returns the disposer restoring the previous backend while this one is still installed.
   */
  setSource(source: PersonaMenuSource): () => void {
    const previous = this.source
    if (source === previous) return () => {}
    for (const dispose of this.subscriptions.values()) dispose()
    this.source = source
    for (const listener of this.subscriptions.keys()) {
      this.subscriptions.set(listener, source.subscribe(listener))
    }
    for (const listener of this.subscriptions.keys()) listener()
    return () => {
      if (this.source === source) this.setSource(previous)
    }
  }
}
