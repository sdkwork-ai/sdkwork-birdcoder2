/**
 * The hero scene-staging store: which creation scene the new-session hero's
 * switcher has staged. Staging never navigates — the owning plugin's
 * submission observer consumes a non-code staging when the session's first
 * message lands. The instance lives with the plugin (created in apply), so a
 * staged pick survives the hero's mount cycles instead of resetting whenever
 * the blank phase ends.
 */

/** The scenes the hero switcher stages; `code` is the resting scene. */
export type HeroScene = 'code' | 'video' | 'document'

/** Read/write/subscribe face of the staging store (useSyncExternalStore-compatible). */
export interface HeroSceneStore {
  /** @returns the staged scene. */
  get(): HeroScene
  /**
   * Stage a scene and notify subscribers.
   * @param next - the scene the pills show as selected.
   */
  set(next: HeroScene): void
  /**
   * Observe staging changes.
   * @param listener - called after every `set` that changes the scene.
   * @returns the unsubscribe disposer.
   */
  subscribe(listener: () => void): () => void
}

/**
 * Create the staging store. A plain observable rather than the framework
 * store machinery: that machinery instantiates per entry mount, which would
 * forget the pick exactly when the hero unmounts (the first submission).
 * @returns the store face.
 */
export function createHeroSceneStore(): HeroSceneStore {
  let scene: HeroScene = 'code'
  const listeners = new Set<() => void>()
  return {
    get: () => scene,
    set: (next) => {
      if (scene === next) return
      scene = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
