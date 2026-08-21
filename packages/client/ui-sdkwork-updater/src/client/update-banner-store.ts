/**
 * Update banner slot store: the bridge-pushed update state snapshot plus the
 * same-version offer dismissal flag. The plugin's apply-world listener is the only
 * writer; the banner component reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'

/** Banner state mirrored from the bridge-pushed update states. */
export interface UpdateBannerState {
  /** Current update phase; 'idle' until the first bridge push. */
  phase: DesktopUpdateState['phase']
  /** Whether this build can download and hand off its installer. */
  canInstall: boolean
  /** Version the updater is offering or installing, while one is known. */
  version: string | undefined
  /** GitHub release title, when the provider reported one. */
  releaseName: string | undefined
  /** GitHub release body markdown, when the provider reported one. */
  releaseNotes: string | undefined
  /** Download progress percent, while the phase is `downloading`. */
  progressPercent: number | undefined
  /** Human-readable driver failure; cleared by the next check. */
  error: string | undefined
  /** Version whose offer the user dismissed; progress and completion still render. */
  dismissedVersion: string | undefined
}

/** Declared action shape giving the exported factory a stable return type. */
type UpdateBannerActions = {
  /** Mirror one bridge-pushed update state. */
  sync: (draft: UpdateBannerState, next: DesktopUpdateState) => void
  /** Dismiss the current offer; a different version clears the dismissal. */
  dismiss: (draft: UpdateBannerState) => void
}

/**
 * Declares the update banner state and dismiss surface.
 * @returns the store handle.
 */
export function createUpdateBannerStore(): EngineStoreHandle<UpdateBannerState, UpdateBannerActions> {
  return defineStore({
    init: (): UpdateBannerState => ({
      phase: 'idle',
      canInstall: false,
      version: undefined,
      releaseName: undefined,
      releaseNotes: undefined,
      progressPercent: undefined,
      error: undefined,
      dismissedVersion: undefined,
    }),
    actions: {
      sync: (draft, next) => {
        // A different version clears a previous dismissal. The component
        // applies the retained value only while the same version is offered.
        if (next.version !== undefined && next.version !== draft.dismissedVersion) {
          draft.dismissedVersion = undefined
        }
        draft.phase = next.phase
        draft.canInstall = next.canInstall
        draft.version = next.version
        draft.releaseName = next.releaseName
        draft.releaseNotes = next.releaseNotes
        draft.progressPercent = next.progress?.percent
        draft.error = next.error
      },
      dismiss: (draft) => {
        if (draft.version !== undefined) draft.dismissedVersion = draft.version
      },
    },
  })
}
