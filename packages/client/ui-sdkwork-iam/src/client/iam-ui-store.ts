/**
 * ui-sdkwork-iam UI store: the cross-entry viewing state the sign-in surfaces
 * share (the settings-menu gesture and gated mode pages open the modal; the
 * shell.overlay host renders it). Open state and the shown step are the only
 * members; presentation dispatch itself lives in the IamService.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Which surface the open sign-in modal shows. */
export type IamSignInStep =
  /** The product login page: brand, welcome line, and the sign-in / API-key choice. */
  | 'entry'
  /** The account method form: password, phone code, email code, or QR. */
  | 'login'
  /** The browser hand-off: the hosted login page is open in the system browser. */
  | 'browser'

/** Shared sign-in surface state. */
export interface IamUiState {
  /** Whether the modal sign-in surface is showing. */
  modalOpen: boolean
  /** The surface an open modal shows; ignored while closed. */
  step: IamSignInStep
}

/** Declared action shape giving the exported factory a stable return type. */
type IamUiActions = {
  openEntry: (draft: IamUiState) => void
  openLogin: (draft: IamUiState) => void
  openBrowser: (draft: IamUiState) => void
  closeModal: (draft: IamUiState) => void
}

/**
 * Declares the sign-in modal state and write surface.
 * @returns the store handle.
 */
export function createIamUiStore(): EngineStoreHandle<IamUiState, IamUiActions> {
  return defineStore({
    init: (): IamUiState => ({ modalOpen: false, step: 'entry' }),
    actions: {
      openEntry: (draft) => { draft.modalOpen = true; draft.step = 'entry' },
      openLogin: (draft) => { draft.modalOpen = true; draft.step = 'login' },
      openBrowser: (draft) => { draft.modalOpen = true; draft.step = 'browser' },
      closeModal: (draft) => { draft.modalOpen = false },
    },
  })
}
