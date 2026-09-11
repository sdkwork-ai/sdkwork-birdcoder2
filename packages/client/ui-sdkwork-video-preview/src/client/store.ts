/**
 * Tab-scoped video player state.
 *
 * What survives leaving and returning to a tab is the transport state a reader
 * set: the playback rate, the volume, whether it is muted or looping, the zoom,
 * and where the playhead was. The declaration is plugin-local because this
 * player is its only owner — the office previews share `PagedView` because a
 * page and a slide really are the same state, and a playhead is not.
 */
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

/** Playback rates the player offers, matching the browser's own menu. */
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** Zoom is either a fixed multiple of the picture's own size, or the stage-fitting scale. */
export type VideoZoom = number | 'fit'

/** One tab's transport state for the video it shows. */
export interface VideoView {
  readonly rate: number
  readonly volume: number
  readonly muted: boolean
  readonly loop: boolean
  /** Playhead in seconds, kept so a returned-to tab resumes where it was. */
  readonly position: number
  /** Picture scale, `'fit'` until the reader zooms. */
  readonly zoom: VideoZoom
}

/** Transport state before the reader changes anything. */
export const DEFAULT_VIDEO_VIEW: VideoView = { rate: 1, volume: 1, muted: false, loop: false, position: 0, zoom: 'fit' }

/** Transport state isolated by the owning tab record. */
export interface VideoViewState {
  byTab: Record<TabId, VideoView>
}

/**
 * The mutations the player performs on its own state.
 *
 * A type alias rather than an interface: the store engine constrains actions
 * with an index signature, which only alias-declared object types satisfy
 * structurally.
 */
export type VideoViewActions = {
  /** @param draft - transport state. @param tabId - owning tab. @param patch - fields to replace. */
  readonly update: (draft: VideoViewState, tabId: TabId, patch: Partial<VideoView>) => void
  /** @param draft - transport state. @param tabId - closed tab whose state is discarded. */
  readonly forget: (draft: VideoViewState, tabId: TabId) => void
}

/** The store declaration this preview passes to `defineStore`. */
export const videoViewStore: {
  readonly init: () => VideoViewState
  readonly actions: VideoViewActions
} = {
  init: (): VideoViewState => ({ byTab: {} }),
  actions: {
    update: (draft, tabId, patch) => {
      draft.byTab[tabId] = { ...(draft.byTab[tabId] ?? DEFAULT_VIDEO_VIEW), ...patch }
    },
    forget: (draft, tabId) => {
      const remaining: VideoViewState['byTab'] = {}
      for (const [id, view] of Object.entries(draft.byTab) as [TabId, VideoView][]) {
        if (id !== tabId) remaining[id] = view
      }
      draft.byTab = remaining
    },
  },
}

/** The engine handle this preview holds for its own player store. */
export type VideoViewStore = EngineStoreHandle<VideoViewState, VideoViewActions>
