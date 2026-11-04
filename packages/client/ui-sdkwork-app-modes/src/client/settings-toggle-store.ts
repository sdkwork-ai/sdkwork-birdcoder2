/**
 * Settings-toggle store: a mirror of one boolean in the
 * `ui-sdkwork-app-modes` settings scope snapshot, scoped to one consumer. The
 * plugin's apply-world change listener is the only writer; the consuming
 * component reads via props.useStore.
 *
 * The same factory backs the two General rows and the hero scene switcher's
 * visibility seat: they are one shape — a durable boolean the surface renders —
 * and each mounting position gets its own instance because a declared store
 * mounts under exactly one slot scope.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Toggle state mirrored from the settings scope snapshot. */
export interface SettingsToggleState {
  /** Current value; undefined until the scope accepts a section. */
  value: boolean | undefined
  /** Whether the consuming surface may write (ready scope on a writable document). */
  writable: boolean
  /** Scope revision for the change guard; -1 until the first sync. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type SettingsToggleActions = {
  sync: (draft: SettingsToggleState, next: SettingsToggleState) => void
}

/**
 * Declares one settings-toggle state and its sync surface.
 * @returns the store handle.
 */
export function createSettingsToggleStore(): EngineStoreHandle<SettingsToggleState, SettingsToggleActions> {
  return defineStore({
    init: (): SettingsToggleState => ({ value: undefined, writable: false, revision: -1 }),
    actions: {
      sync: (draft, next) => {
        if (next.revision <= draft.revision) return
        draft.value = next.value
        draft.writable = next.writable
        draft.revision = next.revision
      },
    },
  })
}
