/**
 * ui-sdkwork-about dialog store: the About dialog's visibility, shared by the
 * `ctx.about` service (which opens it from the desktop About command) and the
 * `shell.overlay` host (which renders it).
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Shared About dialog state. */
export interface AboutState {
  /** Whether the About dialog is showing. */
  open: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type AboutActions = {
  open: (draft: AboutState) => void
  close: (draft: AboutState) => void
}

/**
 * Declares the About dialog state and write surface.
 * @returns the store handle.
 */
export function createAboutStore(): EngineStoreHandle<AboutState, AboutActions> {
  return defineStore({
    init: (): AboutState => ({ open: false }),
    actions: {
      open: (draft) => { draft.open = true },
      close: (draft) => { draft.open = false },
    },
  })
}
