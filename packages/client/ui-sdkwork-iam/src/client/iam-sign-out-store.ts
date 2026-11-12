/**
 * ui-sdkwork-iam sign-out store: the confirmation dialog's visibility, shared by
 * the service (which asks) and the shell.overlay host (which renders it). Open
 * state is the only member: the account facts the dialog shows ride the
 * service's profile hook, not duplicated state here.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Shared sign-out confirmation state. */
export interface IamSignOutState {
  /** Whether the confirmation dialog is showing. */
  confirmOpen: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type IamSignOutActions = {
  open: (draft: IamSignOutState) => void
  close: (draft: IamSignOutState) => void
}

/**
 * Declares the sign-out confirmation state and write surface.
 * @returns the store handle.
 */
export function createIamSignOutStore(): EngineStoreHandle<IamSignOutState, IamSignOutActions> {
  return defineStore({
    init: (): IamSignOutState => ({ confirmOpen: false }),
    actions: {
      open: (draft) => { draft.confirmOpen = true },
      close: (draft) => { draft.confirmOpen = false },
    },
  })
}
