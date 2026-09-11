/**
 * Tab-scoped image viewing state.
 *
 * An image has no pages, so this is not the paged-viewer store: what survives a
 * tab switch is the zoom and the rotation the reader chose. The declaration is
 * plugin-local because the image preview is its only owner; it would move to a
 * shared module only when a second preview needed exactly these fields.
 */
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'

/** Quarter turns, the only rotations an image preview needs. */
export type ImageRotation = 0 | 90 | 180 | 270

/** One tab's viewing state for the image it shows. */
export interface ImageView {
  readonly zoom: PagedZoom
  readonly rotation: ImageRotation
}

/** Viewing state before the reader changes anything. */
export const DEFAULT_IMAGE_VIEW: ImageView = { zoom: 'fit', rotation: 0 }

/** Viewing state isolated by the owning tab record. */
export interface ImageViewState {
  byTab: Record<TabId, ImageView>
}

/**
 * The mutations the image preview performs on its own state.
 *
 * A type alias rather than an interface: the store engine constrains actions
 * with an index signature, which only alias-declared object types satisfy
 * structurally.
 */
export type ImageViewActions = {
  /** @param draft - view state. @param tabId - owning tab. @param zoom - fit or a fixed multiple. */
  readonly zoom: (draft: ImageViewState, tabId: TabId, zoom: PagedZoom) => void
  /** @param draft - view state. @param tabId - owning tab. @param rotation - clockwise quarter turns. */
  readonly rotation: (draft: ImageViewState, tabId: TabId, rotation: ImageRotation) => void
  /** @param draft - view state. @param tabId - closed tab whose state is discarded. */
  readonly forget: (draft: ImageViewState, tabId: TabId) => void
}

/** The store declaration this preview passes to `defineStore`. */
export const imageViewStore: {
  readonly init: () => ImageViewState
  readonly actions: ImageViewActions
} = {
  init: (): ImageViewState => ({ byTab: {} }),
  actions: {
    zoom: (draft, tabId, zoom) => {
      draft.byTab[tabId] = { ...(draft.byTab[tabId] ?? DEFAULT_IMAGE_VIEW), zoom }
    },
    rotation: (draft, tabId, rotation) => {
      draft.byTab[tabId] = { ...(draft.byTab[tabId] ?? DEFAULT_IMAGE_VIEW), rotation }
    },
    forget: (draft, tabId) => {
      const remaining: ImageViewState['byTab'] = {}
      for (const [id, view] of Object.entries(draft.byTab) as [TabId, ImageView][]) {
        if (id !== tabId) remaining[id] = view
      }
      draft.byTab = remaining
    },
  },
}

/** The engine handle this preview holds for its own image-view store. */
export type ImageViewStore = EngineStoreHandle<ImageViewState, ImageViewActions>
