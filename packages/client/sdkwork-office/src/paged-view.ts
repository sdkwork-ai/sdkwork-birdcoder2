/**
 * The paged-viewer store both office previews declare.
 *
 * A document preview shows one selected page of a paginated artifact and a zoom
 * level, isolated per tab. That state is the same for a Word page and a
 * PowerPoint slide, so the declaration lives here and each preview hands it to
 * `defineStore`; the engine handle stays the plugin's own.
 *
 * This module has no runtime imports: `defineStore` binds the declaration at
 * the call site, so a preview bundle inlines this file without acquiring a
 * dependency of its own.
 */
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

/** Zoom is either a fixed multiple or the viewer-fitting scale. */
export type PagedZoom = number | 'fit'

/** One tab's viewing position inside a paginated document. */
export interface PagedView {
  /** Selected 1-based page. */
  readonly index: number
  readonly zoom: PagedZoom
}

/** Initial viewing position before a tab selects another page. */
export const DEFAULT_PAGED_VIEW: PagedView = { index: 1, zoom: 'fit' }

/** Viewing state isolated by the owning tab record. */
export interface PagedViewState {
  byTab: Record<TabId, PagedView>
}

/**
 * The mutations a paged viewer performs on its own state.
 *
 * A type alias rather than an interface: the store engine constrains actions
 * with an index signature, which only alias-declared object types satisfy
 * structurally.
 */
export type PagedViewActions = {
  /** @param draft - view state. @param tabId - owning tab. @param index - selected 1-based page. */
  readonly index: (draft: PagedViewState, tabId: TabId, index: number) => void
  /** @param draft - view state. @param tabId - owning tab. @param zoom - fit or a fixed multiple. */
  readonly zoom: (draft: PagedViewState, tabId: TabId, zoom: PagedZoom) => void
  /** @param draft - view state. @param tabId - closed tab whose position is discarded. */
  readonly forget: (draft: PagedViewState, tabId: TabId) => void
}

/**
 * The store declaration a paged preview passes to `defineStore`.
 *
 * Sharing one declaration keeps tab-scoped page and zoom behaviour identical
 * across the document formats without either preview importing the other.
 */
export const pagedViewStore: {
  readonly init: () => PagedViewState
  readonly actions: PagedViewActions
} = {
  init: (): PagedViewState => ({ byTab: {} }),
  actions: {
    index: (draft, tabId, index) => {
      draft.byTab[tabId] = { ...(draft.byTab[tabId] ?? DEFAULT_PAGED_VIEW), index }
    },
    zoom: (draft, tabId, zoom) => {
      draft.byTab[tabId] = { ...(draft.byTab[tabId] ?? DEFAULT_PAGED_VIEW), zoom }
    },
    forget: (draft, tabId) => {
      const remaining: PagedViewState['byTab'] = {}
      for (const [id, view] of Object.entries(draft.byTab) as [TabId, PagedView][]) {
        if (id !== tabId) remaining[id] = view
      }
      draft.byTab = remaining
    },
  },
}

/** The engine handle a preview holds for its own paged-view store. */
export type PagedViewStore = EngineStoreHandle<PagedViewState, PagedViewActions>
