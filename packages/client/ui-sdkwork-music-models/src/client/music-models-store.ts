/**
 * Music-models section state: what the settings page renders from.
 *
 * The rows are a projection of the `ui-sdkwork-music-models` scope snapshot —
 * never a local guess — so a write the Host refuses shows up as the row
 * returning to its stored value instead of the page keeping the edit it hoped
 * for. `saving` and `failed` are the only optimistic facts, and they report a
 * write in flight rather than a value.
 *
 * The API key never rides this projection: the scope carries it, but the page
 * only needs to know whether one is stored, so `hasApiKey` is what crosses into
 * render code. A key the user typed lives in the row's own draft until save.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SdkworkMusicProviderKind } from '../music-models-settings.ts'

/** One model row the page renders. */
export interface MusicModelRow {
  /** Model id as the provider expects it on the wire. */
  readonly id: string
  /** Name the page shows. */
  readonly displayName: string
  /** sdkwork-models catalog key, empty for a hand-added model. */
  readonly catalogKey: string
  /** Whether a generation call may select this model. */
  readonly enabled: boolean
  /** Whether the generated track is instrumental only. */
  readonly instrumental: boolean
  /** Default track length in whole seconds; zero leaves the provider's own default. */
  readonly durationSeconds: number
  /** Default audio format; empty leaves the provider's own default. */
  readonly format: string
}

/** One provider row the page renders. */
export interface MusicProviderRow {
  /** Stable local id. */
  readonly id: string
  /** Display name of the connection. */
  readonly label: string
  /** Official vendor root or relay station. */
  readonly kind: SdkworkMusicProviderKind
  /** sdkwork-models vendor code, empty for a relay. */
  readonly vendor: string
  /** Protocol code the base URL speaks. */
  readonly protocol: string
  /** sdkwork-models region code. */
  readonly region: string
  /** API root every call is issued against. */
  readonly baseUrl: string
  /** Environment variable carrying the credential, empty when none is named. */
  readonly apiKeyEnv: string
  /** Whether a key is stored; the key itself never reaches render code. */
  readonly hasApiKey: boolean
  /** Whether generation may use this provider. */
  readonly enabled: boolean
  /** Models this provider offers. */
  readonly models: readonly MusicModelRow[]
}

/** Section status of the settings page. */
export type MusicModelsStatus = 'loading' | 'ready' | 'unavailable'

/** Music-models section state. */
export interface MusicModelsSectionState {
  /** Whether the Host serves the section to this client. */
  status: MusicModelsStatus
  /** Whether the settings document accepts writes. */
  writable: boolean
  /** Whether a write is crossing the wire. */
  saving: boolean
  /** Whether the last write did not land as staged. */
  failed: boolean
  /** Absolute path of the projected `.sdkwork.` document. */
  filePath: string
  /** Provider a call uses when it names none. */
  defaultProviderId: string
  /** Whether the projected document carries literal API keys. */
  writeSecrets: boolean
  /** Provider rows, in section order. */
  providers: readonly MusicProviderRow[]
}

/** Declared action shape giving the exported factory a stable return type. */
type MusicModelsSectionActions = {
  /** Publish the scope projection (status, writability, rows). */
  mirror: (draft: MusicModelsSectionState, next: {
    status: MusicModelsStatus
    writable: boolean
    defaultProviderId: string
    providers: readonly MusicProviderRow[]
  }) => void
  /** Publish the resolved projection path. */
  file: (draft: MusicModelsSectionState, path: string) => void
  /** Publish whether the projection carries literal keys. */
  writeSecrets: (draft: MusicModelsSectionState, enabled: boolean) => void
  /** Mark a write in flight, clearing the previous failure. */
  writing: (draft: MusicModelsSectionState) => void
  /** Settle a write: whether the Host holds the staged value. */
  settled: (draft: MusicModelsSectionState, accepted: boolean) => void
}

/**
 * Declares the music-models section state and its mutation surface.
 * @returns the store handle.
 */
export function createMusicModelsSectionStore(): EngineStoreHandle<MusicModelsSectionState, MusicModelsSectionActions> {
  return defineStore({
    init: (): MusicModelsSectionState => ({
      status: 'loading',
      writable: false,
      saving: false,
      failed: false,
      filePath: '',
      defaultProviderId: '',
      writeSecrets: false,
      providers: [],
    }),
    actions: {
      mirror: (draft, next) => {
        draft.status = next.status
        draft.writable = next.writable
        draft.defaultProviderId = next.defaultProviderId
        draft.providers = next.providers
      },
      file: (draft, path) => { draft.filePath = path },
      writeSecrets: (draft, enabled) => { draft.writeSecrets = enabled },
      writing: (draft) => {
        draft.saving = true
        draft.failed = false
      },
      settled: (draft, accepted) => {
        draft.saving = false
        draft.failed = !accepted
      },
    },
  })
}
