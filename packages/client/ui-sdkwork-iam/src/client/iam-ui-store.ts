/**
 * ui-sdkwork-iam UI store: the cross-entry viewing state the sign-in surfaces share
 * (the settings-menu gesture opens the modal; the shell.overlay host renders
 * it). Modal open state is the only member; presentation dispatch itself
 * lives in the IamService.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Shared sign-in surface state. */
export interface IamUiState {
  /** Whether the modal sign-in surface is showing. */
  modalOpen: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type IamUiActions = {
  openModal: (draft: IamUiState) => void
  closeModal: (draft: IamUiState) => void
}

/**
 * Declares the sign-in modal state and write surface.
 * @returns the store handle.
 */
export function createIamUiStore(): EngineStoreHandle<IamUiState, IamUiActions> {
  return defineStore({
    init: (): IamUiState => ({ modalOpen: false }),
    actions: {
      openModal: (draft) => { draft.modalOpen = true },
      closeModal: (draft) => { draft.modalOpen = false },
    },
  })
}
