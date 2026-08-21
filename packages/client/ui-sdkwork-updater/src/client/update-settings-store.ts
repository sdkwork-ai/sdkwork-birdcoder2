/**
 * Update settings row slot store: a mirror of the `desktop` settings scope
 * snapshot plus the bridge-pushed update state (the row's status line). The
 * plugin's apply-world listeners are the only writers; the row component reads
 * via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'
import type { UpdateChannel } from './update-settings.ts'

/** Row state mirrored from the settings scope and the update state. */
export interface UpdateSettingsRowState {
  /** Current auto-check value; undefined until the scope accepts a section. */
  autoCheckUpdates: boolean | undefined
  /** Current update channel; undefined until the scope accepts a section. */
  updateChannel: UpdateChannel | undefined
  /** Current auto-download value; undefined until the scope accepts a section. */
  autoDownload: boolean | undefined
  /** Whether the row may write (ready scope on a writable host document). */
  writable: boolean
  /** Scope revision for the change guard; -1 until the first sync. */
  revision: number
  /** Current update phase from the bridge (the row's status line). */
  phase: DesktopUpdateState['phase']
  /** Whether this build can download and hand off its installer. */
  canInstall: boolean
  /** Version the updater is offering, while one is known. */
  version: string | undefined
  /** Human-readable driver failure; cleared by the next check. */
  error: string | undefined
}

/** One settings-scope sync input: the resolved fields plus the revision guard. */
export interface UpdateSettingsSync {
  autoCheckUpdates: boolean | undefined
  updateChannel: UpdateChannel | undefined
  autoDownload: boolean | undefined
  writable: boolean
  revision: number | undefined
}

/** Declared action shape giving the exported factory a stable return type. */
type UpdateSettingsRowActions = {
  /** Mirror one settings-scope snapshot; stale revisions are dropped. */
  syncSettings: (draft: UpdateSettingsRowState, next: UpdateSettingsSync) => void
  /** Mirror one bridge-pushed update state (unconditional; the bridge owns the sequence). */
  syncUpdate: (draft: UpdateSettingsRowState, next: DesktopUpdateState) => void
}

/**
 * Declares the update settings row state.
 * @returns the store handle.
 */
export function createUpdateSettingsRowStore(): EngineStoreHandle<UpdateSettingsRowState, UpdateSettingsRowActions> {
  return defineStore({
    init: (): UpdateSettingsRowState => ({
      autoCheckUpdates: undefined,
      updateChannel: undefined,
      autoDownload: undefined,
      writable: false,
      revision: -1,
      phase: 'idle',
      canInstall: false,
      version: undefined,
      error: undefined,
    }),
    actions: {
      syncSettings: (draft, next) => {
        const revision = next.revision ?? -1
        if (revision <= draft.revision) return
        draft.autoCheckUpdates = next.autoCheckUpdates
        draft.updateChannel = next.updateChannel
        draft.autoDownload = next.autoDownload
        draft.writable = next.writable
        draft.revision = revision
      },
      syncUpdate: (draft, next) => {
        draft.phase = next.phase
        draft.canInstall = next.canInstall
        draft.version = next.version
        draft.error = next.error
      },
    },
  })
}
