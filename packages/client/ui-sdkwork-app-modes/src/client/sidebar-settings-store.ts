/**
 * Sidebar settings row slot store: a mirror of the `ui-sdkwork-app-modes` settings
 * scope snapshot. The plugin's apply-world change listener is the only
 * writer; the row component reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Row state mirrored from the settings scope snapshot. */
export interface SidebarSettingsRowState {
  /** Current sidebar-visibility value; undefined until the scope accepts a section. */
  visible: boolean | undefined
  /** Whether the row may write (ready scope on a writable host document). */
  writable: boolean
  /** Scope revision for the change guard; -1 until the first sync. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type SidebarSettingsRowActions = {
  sync: (draft: SidebarSettingsRowState, next: SidebarSettingsRowState) => void
}

/**
 * Declares the sidebar settings row state and write surface.
 * @returns the store handle.
 */
export function createSidebarSettingsRowStore(): EngineStoreHandle<SidebarSettingsRowState, SidebarSettingsRowActions> {
  return defineStore({
    init: (): SidebarSettingsRowState => ({ visible: undefined, writable: false, revision: -1 }),
    actions: {
      sync: (draft, next) => {
        if (next.revision <= draft.revision) return
        draft.visible = next.visible
        draft.writable = next.writable
        draft.revision = next.revision
      },
    },
  })
}
