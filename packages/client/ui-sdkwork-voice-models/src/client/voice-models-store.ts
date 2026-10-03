/**
 * Voice-models section state: what the settings page renders from.
 *
 * The rows are a projection of the `ui-sdkwork-voice-models` scope snapshot —
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
import type { SdkworkVoiceProviderKind } from '../voice-models-settings.ts'

/** One model row the page renders. */
export interface VoiceModelRow {
  /** Model id as the provider expects it on the wire. */
  readonly id: string
  /** Name the page shows. */
  readonly displayName: string
  /** sdkwork-models catalog key, empty for a hand-added model. */
  readonly catalogKey: string
  /** Whether a synthesis or transcription call may select this model. */
  readonly enabled: boolean
  /** Provider voice identifier; empty leaves the provider's own default. */
  readonly voiceId: string
  /** Audio container to request; empty leaves the provider's own default. */
  readonly format: string
  /** Speaking rate multiplier. */
  readonly speed: number
  /** BCP-47 tag of the language to speak or transcribe; empty leaves the voice's own default. */
  readonly language: string
}

/** One provider row the page renders. */
export interface VoiceProviderRow {
  /** Stable local id. */
  readonly id: string
  /** Display name of the connection. */
  readonly label: string
  /** Official vendor root or relay station. */
  readonly kind: SdkworkVoiceProviderKind
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
  /** Whether synthesis and transcription may use this provider. */
  readonly enabled: boolean
  /** Models this provider offers. */
  readonly models: readonly VoiceModelRow[]
}

/** Section status of the settings page. */
export type VoiceModelsStatus = 'loading' | 'ready' | 'unavailable'

/** Voice-models section state. */
export interface VoiceModelsSectionState {
  /** Whether the Host serves the section to this client. */
  status: VoiceModelsStatus
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
  providers: readonly VoiceProviderRow[]
}

/** Declared action shape giving the exported factory a stable return type. */
type VoiceModelsSectionActions = {
  /** Publish the scope projection (status, writability, rows). */
  mirror: (draft: VoiceModelsSectionState, next: {
    status: VoiceModelsStatus
    writable: boolean
    defaultProviderId: string
    providers: readonly VoiceProviderRow[]
  }) => void
  /** Publish the resolved projection path. */
  file: (draft: VoiceModelsSectionState, path: string) => void
  /** Publish whether the projection carries literal keys. */
  writeSecrets: (draft: VoiceModelsSectionState, enabled: boolean) => void
  /** Mark a write in flight, clearing the previous failure. */
  writing: (draft: VoiceModelsSectionState) => void
  /** Settle a write: whether the Host holds the staged value. */
  settled: (draft: VoiceModelsSectionState, accepted: boolean) => void
}

/**
 * Declares the voice-models section state and its mutation surface.
 * @returns the store handle.
 */
export function createVoiceModelsSectionStore(): EngineStoreHandle<VoiceModelsSectionState, VoiceModelsSectionActions> {
  return defineStore({
    init: (): VoiceModelsSectionState => ({
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
