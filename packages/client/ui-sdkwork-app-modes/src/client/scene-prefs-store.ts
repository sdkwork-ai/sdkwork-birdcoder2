/**
 * Scene-strip preference store: a mirror of the skill manager's suggestion
 * preference, scoped to what the strip needs.
 *
 * The strip reads two facts from the skill manager — which skills the user took
 * out of the new-session suggestion row, and which ones the user added to it —
 * and nothing else. Those facts arrive through the `skillPreferences` service
 * (a feature plugin may not reach into another's state directly), are mirrored
 * here on every change, and reach the strip as a declared store so the component
 * itself owns no subscription.
 *
 * Both lists are name lists rather than sets: store state is shared UI data and
 * stays JSON-compatible. The component materializes the membership tests once
 * per render, which is where the allocation belongs.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Scene-strip state mirrored from the skill manager. */
export interface ScenePrefsState {
  /** Skill names the user kept out of the new-session suggestion row. */
  hiddenTags: readonly string[]
  /** Skill names the user added to the new-session suggestion row. */
  pinnedTags: readonly string[]
}

/** Declared action shape giving the exported factory a stable return type. */
type ScenePrefsActions = {
  /** Publish the current suggestion preference. */
  sync: (
    draft: ScenePrefsState,
    tags: { readonly hiddenTags: readonly string[]; readonly pinnedTags: readonly string[] },
  ) => void
}

/**
 * Declares the scene-strip preference state.
 * @returns the store handle.
 */
export function createScenePrefsStore(): EngineStoreHandle<ScenePrefsState, ScenePrefsActions> {
  return defineStore({
    init: (): ScenePrefsState => ({ hiddenTags: [], pinnedTags: [] }),
    actions: {
      sync: (draft, tags) => {
        draft.hiddenTags = tags.hiddenTags
        draft.pinnedTags = tags.pinnedTags
      },
    },
  })
}
