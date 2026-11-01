/**
 * ui-sdkwork-persona UI store: the cross-entry viewing state the picker shares.
 * The settings-menu persona row and the first-run gate open the dialog; the
 * `shell.overlay` host renders it. Dialog open state is the only member; the
 * choices themselves live in the service's settings scope.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Shared persona surface state. */
export interface PersonaPickerState {
  /** Whether the persona picker is showing. */
  dialogOpen: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type PersonaPickerActions = {
  openDialog: (draft: PersonaPickerState) => void
  closeDialog: (draft: PersonaPickerState) => void
}

/**
 * Declares the persona picker state and write surface.
 * @returns the store handle.
 */
export function createPersonaPickerStore(): EngineStoreHandle<PersonaPickerState, PersonaPickerActions> {
  return defineStore({
    init: (): PersonaPickerState => ({ dialogOpen: false }),
    actions: {
      openDialog: (draft) => { draft.dialogOpen = true },
      closeDialog: (draft) => { draft.dialogOpen = false },
    },
  })
}
