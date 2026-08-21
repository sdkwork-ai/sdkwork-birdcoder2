/**
 * The feedback channel the settings menu renders: a snapshot source for the
 * menu's feedback row plus the open gesture. The shipped provider is the
 * unavailable state — the row stays hidden and opening no-ops. The ui-sdkwork-feedback
 * plugin replaces the source behind the same face through `setSource`; the
 * menu keeps consuming the snapshot contract untouched.
 */

/** Feedback channel profile; the unavailable default carries no channel. */
export interface FeedbackProfile {
  /** Whether a feedback channel exists; true renders the menu's feedback row. */
  available: boolean
}

/**
 * One feedback backend behind the runtime's snapshot face. The unavailable
 * default is a static profile; a real backend (the ui-sdkwork-feedback plugin)
 * publishes availability and opens its owned feedback dialog.
 */
export interface FeedbackSource {
  /** @returns the current profile (stable reference until the source moves). */
  getSnapshot(): FeedbackProfile
  /** Observe snapshot replacements. */
  subscribe(listener: () => void): () => void
  /** Open the feedback surface; the unavailable provider has no surface. */
  open(): void
}

const UNAVAILABLE_PROFILE: FeedbackProfile = { available: false }

const UNAVAILABLE_SOURCE: FeedbackSource = {
  getSnapshot: () => UNAVAILABLE_PROFILE,
  subscribe: () => () => {},
  open: () => {},
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    feedback: FeedbackRuntime
  }
}

/**
 * Feedback runtime: stable snapshot source and the open gesture. The default
 * source is the unavailable profile; a backend swaps it through `setSource`,
 * so the menu consumes one snapshot contract in both states.
 */
export class FeedbackRuntime {
  private source: FeedbackSource = UNAVAILABLE_SOURCE

  /** @returns the current profile (stable reference until a provider changes it). */
  getSnapshot(): FeedbackProfile {
    return this.source.getSnapshot()
  }

  /**
   * Observe snapshot replacements.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.source.subscribe(listener)
  }

  /** Open the feedback surface through the active source (no-op while unavailable). */
  open(): void {
    this.source.open()
  }

  /**
   * Swap the feedback backend. Subscribers see the new source's snapshots
   * immediately; the previous source's subscriptions are dropped.
   * @param source - the backend replacing the current one.
   */
  setSource(source: FeedbackSource): void {
    this.source = source
  }
}
