/**
 * Tray settings row slot store: a mirror of the `desktop` settings scope
 * snapshot. The plugin's apply-world change listener is the only writer; the
 * row component reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Row state mirrored from the settings scope snapshot. */
export interface TraySettingsRowState {
  /** Current close-to-tray value; undefined until the scope accepts a section. */
  enabled: boolean | undefined
  /** Whether the row may write (ready scope on a writable host document). */
  writable: boolean
  /** Scope revision for the change guard; -1 until the first sync. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type TraySettingsRowActions = {
  sync: (draft: TraySettingsRowState, next: TraySettingsRowState) => void
}

/**
 * Declares the tray settings row state and write surface.
 * @returns the store handle.
 */
export function createTraySettingsRowStore(): EngineStoreHandle<TraySettingsRowState, TraySettingsRowActions> {
  return defineStore({
    init: (): TraySettingsRowState => ({ enabled: undefined, writable: false, revision: -1 }),
    actions: {
      sync: (draft, next) => {
        if (next.revision <= draft.revision) return
        draft.enabled = next.enabled
        draft.writable = next.writable
        draft.revision = next.revision
      },
    },
  })
}
