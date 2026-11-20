/**
 * Access-token dialog state: the workspace row menu (or the shared workspace
 * context menu) opens the initializer for one project directory, and the
 * frame's floating layer renders it. Dialog open state and the captured
 * project are the only members; every read and write lives in the initializer.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** One project directory the dialog was opened for. */
export interface AccessTokenDialogTarget {
  /** Absolute project directory of the clicked workspace row. */
  directory: string
  /** Display title of the clicked row, shown in the dialog header. */
  displayTitle: string
}

/** Shared access-token surface state. */
export interface AccessTokenDialogState {
  /** Whether the initializer dialog is showing. */
  open: boolean
  /** Project the dialog was opened for; null while closed. */
  target: AccessTokenDialogTarget | null
}

/** Declared action shape giving the exported factory a stable return type. */
type AccessTokenDialogActions = {
  openDialog: (draft: AccessTokenDialogState, target: AccessTokenDialogTarget) => void
  closeDialog: (draft: AccessTokenDialogState) => void
}

/**
 * Declares the initializer dialog state and write surface.
 * @returns the store handle.
 */
export function createAccessTokenDialogStore(): EngineStoreHandle<AccessTokenDialogState, AccessTokenDialogActions> {
  return defineStore({
    init: (): AccessTokenDialogState => ({ open: false, target: null }),
    actions: {
      openDialog: (draft, target) => {
        draft.open = true
        draft.target = target
      },
      closeDialog: (draft) => {
        draft.open = false
        draft.target = null
      },
    },
  })
}
