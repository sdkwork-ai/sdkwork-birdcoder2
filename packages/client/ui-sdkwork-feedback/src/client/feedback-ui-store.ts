/**
 * ui-sdkwork-feedback UI store: the cross-entry viewing state the feedback surfaces
 * share (the settings-menu feedback row opens the dialog; the shell.overlay
 * host renders it). Dialog open state is the only member; submission itself
 * lives in the FeedbackService.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Shared feedback surface state. */
export interface FeedbackUiState {
  /** Whether the feedback dialog is showing. */
  dialogOpen: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type FeedbackUiActions = {
  openDialog: (draft: FeedbackUiState) => void
  closeDialog: (draft: FeedbackUiState) => void
}

/**
 * Declares the feedback dialog state and write surface.
 * @returns the store handle.
 */
export function createFeedbackUiStore(): EngineStoreHandle<FeedbackUiState, FeedbackUiActions> {
  return defineStore({
    init: (): FeedbackUiState => ({ dialogOpen: false }),
    actions: {
      openDialog: (draft) => { draft.dialogOpen = true },
      closeDialog: (draft) => { draft.dialogOpen = false },
    },
  })
}
