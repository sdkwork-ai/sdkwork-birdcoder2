/**
 * Settings menu shell store: the dialog visibility the shell renders and the
 * section it shows, shared so a surface outside the rail (the Chat failure
 * row's configure gesture) can open the dialog on its own section. The
 * hover-menu open state stays component-local viewing state — nothing outside
 * this package opens the popover itself.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Dialog visibility plus the active section and the row to reveal. */
export interface SettingsMenuState {
  /** Whether the settings dialog is showing. */
  dialogOpen: boolean
  /** Active `settings.section` id; undefined lets the shell pick its default row. */
  activeId: string | undefined
  /** Provider route the opened section should reveal, cleared by ordinary navigation. */
  focusProvider: string | undefined
}

/** Declared action shape giving the exported factory a stable return type. */
type SettingsMenuActions = {
  open: (draft: SettingsMenuState) => void
  openSection: (draft: SettingsMenuState, id: string, focusProvider?: string) => void
  select: (draft: SettingsMenuState, id: string) => void
  close: (draft: SettingsMenuState) => void
}

/**
 * Declare the dialog state and the complete mutation API of the shell.
 * @returns one root-scoped store handle for the settings menu.
 */
export function createSettingsMenuStore(): EngineStoreHandle<SettingsMenuState, SettingsMenuActions> {
  return defineStore({
    init: (): SettingsMenuState => ({ dialogOpen: false, activeId: undefined, focusProvider: undefined }),
    actions: {
      open: (draft) => {
        draft.dialogOpen = true
        draft.activeId = undefined
        draft.focusProvider = undefined
      },
      openSection: (draft, id: string, focusProvider?: string) => {
        draft.dialogOpen = true
        draft.activeId = id
        draft.focusProvider = focusProvider
      },
      // Choosing a row by hand is an ordinary visit: the row a deep link asked
      // to reveal is no longer what the user is looking for.
      select: (draft, id: string) => {
        draft.activeId = id
        draft.focusProvider = undefined
      },
      close: (draft) => {
        draft.dialogOpen = false
        draft.activeId = undefined
        draft.focusProvider = undefined
      },
    },
  })
}
