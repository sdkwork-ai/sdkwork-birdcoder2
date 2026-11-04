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
 * The third fact is the master switch: `showSceneTags` decides whether the strip
 * renders at all. It rides the same `sync` because the same page writes it and
 * the same component observes it — a second channel would let the strip render
 * one publish behind the switch.
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
  /** Whether the new-session suggestion strip renders at all. */
  showSceneTags: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type ScenePrefsActions = {
  /** Publish the current suggestion preference. */
  sync: (
    draft: ScenePrefsState,
    tags: {
      readonly hiddenTags: readonly string[]
      readonly pinnedTags: readonly string[]
      readonly showSceneTags: boolean
    },
  ) => void
}

/**
 * Declares the scene-strip preference state.
 * @returns the store handle.
 */
export function createScenePrefsStore(): EngineStoreHandle<ScenePrefsState, ScenePrefsActions> {
  return defineStore({
    init: (): ScenePrefsState => ({ hiddenTags: [], pinnedTags: [], showSceneTags: true }),
    actions: {
      sync: (draft, tags) => {
        draft.hiddenTags = tags.hiddenTags
        draft.pinnedTags = tags.pinnedTags
        draft.showSceneTags = tags.showSceneTags
      },
    },
  })
}
