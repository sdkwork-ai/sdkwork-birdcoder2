/**
 * Tab-scoped audio player state.
 *
 * What survives leaving and returning to a tab is the transport state a reader
 * set: the volume, whether it is muted or looping, the playback rate, and where
 * the playhead was.
 */
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

/** Playback rates the player offers, matching the browser's own menu. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** One tab's transport state for the audio it shows. */
export interface AudioView {
  readonly rate: number
  readonly volume: number
  readonly muted: boolean
  readonly loop: boolean
  /** Playhead in seconds, kept so a returned-to tab resumes where it was. */
  readonly position: number
}

/** Transport state before the reader changes anything. */
export const DEFAULT_AUDIO_VIEW: AudioView = { rate: 1, volume: 1, muted: false, loop: false, position: 0 }

/** Transport state isolated by the owning tab record. */
export interface AudioViewState {
  byTab: Record<TabId, AudioView>
}

/**
 * The mutations the player performs on its own state.
 *
 * A type alias rather than an interface: the store engine constrains actions
 * with an index signature, which only alias-declared object types satisfy
 * structurally.
 */
export type AudioViewActions = {
  /** @param draft - transport state. @param tabId - owning tab. @param patch - fields to replace. */
  readonly update: (draft: AudioViewState, tabId: TabId, patch: Partial<AudioView>) => void
  /** @param draft - transport state. @param tabId - closed tab whose state is discarded. */
  readonly forget: (draft: AudioViewState, tabId: TabId) => void
}

/** The store declaration this preview passes to `defineStore`. */
export const audioViewStore: {
  readonly init: () => AudioViewState
  readonly actions: AudioViewActions
} = {
  init: (): AudioViewState => ({ byTab: {} }),
  actions: {
    update: (draft, tabId, patch) => {
      draft.byTab[tabId] = { ...(draft.byTab[tabId] ?? DEFAULT_AUDIO_VIEW), ...patch }
    },
    forget: (draft, tabId) => {
      const remaining: AudioViewState['byTab'] = {}
      for (const [id, view] of Object.entries(draft.byTab) as [TabId, AudioView][]) {
        if (id !== tabId) remaining[id] = view
      }
      draft.byTab = remaining
    },
  },
}

/** The engine handle this preview holds for its own player store. */
export type AudioViewStore = EngineStoreHandle<AudioViewState, AudioViewActions>
