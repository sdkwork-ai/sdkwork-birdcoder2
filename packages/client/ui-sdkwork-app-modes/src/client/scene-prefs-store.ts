/**
 * Scene-strip preference store: a mirror of the skill manager's suggestion
 * preference, scoped to what the strip needs.
 *
 * The strip reads one fact from the skill manager — which skills the user took
 * out of the new-session suggestion row — and nothing else. That fact arrives
 * through the `skillPreferences` service (a feature plugin may not reach into
 * another's state directly), is mirrored here on every change, and reaches the
 * strip as a declared store so the component itself owns no subscription.
 *
 * `hiddenTags` is a name list rather than a set: store state is shared UI data
 * and stays JSON-compatible.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Scene-strip state mirrored from the skill manager. */
export interface ScenePrefsState {
  /** Skill names the user kept out of the new-session suggestion row. */
  hiddenTags: readonly string[]
}

/** Declared action shape giving the exported factory a stable return type. */
type ScenePrefsActions = {
  /** Publish the current hidden-name list. */
  sync: (draft: ScenePrefsState, hiddenTags: readonly string[]) => void
}

/**
 * Declares the scene-strip preference state.
 * @returns the store handle.
 */
export function createScenePrefsStore(): EngineStoreHandle<ScenePrefsState, ScenePrefsActions> {
  return defineStore({
    init: (): ScenePrefsState => ({ hiddenTags: [] }),
    actions: {
      sync: (draft, hiddenTags) => { draft.hiddenTags = hiddenTags },
    },
  })
}
