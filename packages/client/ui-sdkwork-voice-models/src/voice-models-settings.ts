/**
 * SDKWork voice model configuration: the durable `ui-sdkwork-voice-models`
 * settings section, the `.sdkwork.` document the Host projects it into for
 * skills, and the preset seed the settings page starts from.
 *
 * One section owns one modality. Every provider row is either an **official**
 * vendor (the sdkwork-models catalog's own API root, seeded from
 * `model-presets.ts`) or a **relay** (an OpenAI-compatible station the user
 * points at any base URL), and each row carries its own base URL, protocol,
 * credential source, and model list — so a deployment can front the same model
 * through the vendor or through a relay without either row knowing about the
 * other.
 *
 * The credential is stored twice over, deliberately: `apiKeyEnv` names an
 * environment variable (the form a skill should prefer, because it never
 * copies the secret), and `apiKey` holds a literal the user pasted. The
 * projected document carries the literal only when the user turns on
 * `writeSecrets`; otherwise it reports that a key is configured and where to
 * read it.
 *
 * A model row's defaults mirror the sdkwork-models catalog: `voiceId` is the
 * catalog's per-model voice binding, and `language` follows the bound voice's
 * `primaryLocale`, with `supportedLocales` bounding what that voice accepts.
 * `format` and `speed` are request-side parameters the provider applies when a
 * call names none of its own.
 *
 * This module is the two faces' shared contract: the Host builds its Config
 * and the projection from it, the browser builds the page's reads and writes
 * from it, and neither imports the other.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-voice-models/voice-models-settings
 */

import type { VolatileSnapshot } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { CATALOG_VOICE_MODEL_PRESETS, OFFICIAL_VOICE_VENDOR_PRESETS } from './model-presets.ts'

/** Settings namespace owned by the voice model plugin; also its profile entry id. */
export const VOICE_MODELS_NAMESPACE = 'ui-sdkwork-voice-models'

/** Directory the projected documents live in, under the harness home. */
export const SDKWORK_MODELS_DIRECTORY = 'sdkwork'

/** Name of the skill-facing projection file, inside {@link SDKWORK_MODELS_DIRECTORY}. */
export const VOICE_MODELS_FILE_NAME = 'voice-models.sdkwork.json'

/** Page-global carrying the resolved projection path to the browser half. */
export const VOICE_MODELS_FILE_GLOBAL = '__DSH_SDKWORK_VOICE_MODELS_FILE__'

/** Document kind stamped into the projection, so a reader can identify the file. */
export const VOICE_MODELS_FILE_KIND = 'sdkwork.voice-models'

/** Schema version of the projected document. */
export const SDKWORK_MODELS_FILE_SCHEMA_VERSION = '1.0.0'

/** Field carrying the provider rows. */
export const PROVIDERS_FIELD = 'providers'

/** Field selecting the provider a synthesis or transcription call uses when none is named. */
export const DEFAULT_PROVIDER_FIELD = 'defaultProviderId'

/** Field opting the projected document into carrying literal API keys. */
export const WRITE_SECRETS_FIELD = 'writeSecrets'

/** How a provider row reaches its vendor. */
export type SdkworkVoiceProviderKind = 'official' | 'relay'

/** One model row inside a provider. */
export interface SdkworkVoiceModel {
  /** Model id as the provider expects it on the wire. */
  id: string
  /** Name the settings page shows; catalog display name for a seeded row. */
  displayName: string
  /** sdkwork-models catalog key; empty for a model the catalog does not list. */
  catalogKey: string
  /** Whether a synthesis or transcription call may select this model. */
  enabled: boolean
  /** Provider voice identifier for a text-to-speech model (`alloy`); empty leaves the provider's own default. */
  voiceId: string
  /** Audio container the provider should return (`mp3`, `wav`); empty leaves the provider's own default. */
  format: string
  /** Speaking rate multiplier; the provider's own default is 1. */
  speed: number
  /** BCP-47 tag of the language to speak or transcribe (`zh-CN`); empty leaves the voice's own default. */
  language: string
}

/** One provider row: an official vendor root or a relay station. */
export interface SdkworkVoiceProvider {
  /** Stable local id; unique inside the section. */
  id: string
  /** Display name of the connection. */
  label: string
  /** Whether this row is the vendor itself or a relay fronting one. */
  kind: SdkworkVoiceProviderKind
  /** sdkwork-models vendor code; empty for a relay that fronts no single vendor. */
  vendor: string
  /** Protocol code the base URL speaks (`openai_compatible`, …); empty means vendor-native. */
  protocol: string
  /** sdkwork-models region code (`global`, `cn`); free text for a relay. */
  region: string
  /** API root every call is issued against. */
  baseUrl: string
  /** Credential literal; empty when the key arrives through {@link apiKeyEnv}. */
  apiKey: string
  /** Environment variable carrying the credential; it wins over {@link apiKey} when set. */
  apiKeyEnv: string
  /** Whether synthesis and transcription may use this provider. */
  enabled: boolean
  /** Models this provider offers. */
  models: SdkworkVoiceModel[]
}

/** Durable `ui-sdkwork-voice-models` section. */
export interface SdkworkVoiceModelsSettings {
  /** Provider used when a call names none; empty means the first enabled provider. */
  defaultProviderId: string
  /** Provider rows, in the order the page lists them. */
  providers: SdkworkVoiceProvider[]
  /** Whether the projected document carries literal API keys. */
  writeSecrets: boolean
}

/** Read-only view of the section, as a volatile config snapshot carries it. */
export type SdkworkVoiceModelsSnapshot = VolatileSnapshot<SdkworkVoiceModelsSettings>

/** Credential facts one projected provider reports. */
export interface SdkworkVoiceProviderCredentialDocument {
  /** Environment variable the credential is read from; empty when none is named. */
  env: string
  /** Whether a literal key is stored in the settings document. */
  stored: boolean
  /** The literal key, present only when the document was projected with secrets. */
  value?: string
}

/** One provider as the projected document states it. */
export interface SdkworkVoiceProviderDocument {
  /** Stable local id. */
  id: string
  /** Display name of the connection. */
  label: string
  /** Official vendor root or relay. */
  kind: SdkworkVoiceProviderKind
  /** sdkwork-models vendor code, when the row names one. */
  vendor: string
  /** Protocol code the base URL speaks; empty means vendor-native. */
  protocol: string
  /** sdkwork-models region code. */
  region: string
  /** API root every call is issued against. */
  baseUrl: string
  /** Whether synthesis and transcription may use this provider. */
  enabled: boolean
  /** Where the credential comes from. */
  credential: SdkworkVoiceProviderCredentialDocument
  /** Models this provider offers. */
  models: SdkworkVoiceModel[]
}

/** The skill-facing `.sdkwork.` document the Host projects the section into. */
export interface SdkworkVoiceModelsDocument {
  /** Projection format version. */
  schemaVersion: string
  /** Document kind, so a reader can identify the file. */
  kind: string
  /** Settings namespace that owns this document. */
  plugin: string
  /** Modality the document configures. */
  modality: 'voice'
  /** Projection instant, ISO-8601 UTC. */
  updatedAt: string
  /** Provider a call uses when it names none. */
  defaultProviderId: string
  /** Whether this projection carries literal API keys. */
  writeSecrets: boolean
  /** Provider rows, in section order. */
  providers: SdkworkVoiceProviderDocument[]
}

/** One model row's field schema. */
function modelSchema(): z<SdkworkVoiceModel> {
  return z.object({
    id: z.string().required(),
    displayName: z.string().default(''),
    catalogKey: z.string().default(''),
    enabled: z.boolean().default(true),
    voiceId: z.string().default(''),
    format: z.string().default(''),
    speed: z.number().step(0.05).min(0.25).max(4).default(1),
    language: z.string().default(''),
  })
}

/** One provider row's field schema. */
function providerSchema(): z<SdkworkVoiceProvider> {
  return z.object({
    id: z.string().required(),
    label: z.string().default(''),
    kind: z.union([z.const('official'), z.const('relay')]).default('official'),
    vendor: z.string().default(''),
    protocol: z.string().default(''),
    region: z.string().default(''),
    baseUrl: z.string().default(''),
    apiKey: z.string().default(''),
    apiKeyEnv: z.string().default(''),
    enabled: z.boolean().default(false),
    models: z.array(modelSchema()).default([]),
  })
}

/**
 * Local id of one seeded official vendor row: the catalog keys its API roots by
 * vendor *and* region (MiniMax publishes a `cn` and a `global` root), so the
 * region is what keeps the ids unique.
 * @param vendor - sdkwork-models vendor code.
 * @param region - catalog region of that root.
 * @returns the provider id.
 */
export function officialProviderId(vendor: string, region: string): string {
  return region === '' ? `official-${vendor}` : `official-${vendor}-${region}`
}

/**
 * Build the section's initial provider rows: every catalog vendor with a voice
 * capability, carrying the catalog's own models and API root.
 *
 * The rows start disabled and key-less. An official root is a fact the catalog
 * already publishes, so seeding it costs the user nothing and tells them which
 * vendors exist; no row may make a request until the user enables it and
 * supplies a credential.
 * @returns the seeded provider rows.
 */
export function defaultVoiceProviders(): SdkworkVoiceProvider[] {
  // One API root per vendor *and* region: the catalog lists each root's own
  // models, so a row carries exactly what its root publishes.
  const modelsByRoot = new Map<string, SdkworkVoiceModel[]>()
  for (const model of CATALOG_VOICE_MODEL_PRESETS) {
    const key = `${model.vendor}/${model.region}`
    const rows = modelsByRoot.get(key) ?? []
    rows.push({
      id: model.modelId,
      displayName: model.displayName,
      catalogKey: model.catalogKey,
      enabled: true,
      voiceId: '',
      format: '',
      speed: 1,
      language: '',
    })
    modelsByRoot.set(key, rows)
  }
  return OFFICIAL_VOICE_VENDOR_PRESETS.map(preset => ({
    id: officialProviderId(preset.vendor, preset.region),
    label: preset.displayName,
    kind: 'official',
    vendor: preset.vendor,
    protocol: preset.protocol,
    region: preset.region,
    baseUrl: preset.baseUrl,
    apiKey: '',
    apiKeyEnv: '',
    enabled: false,
    models: modelsByRoot.get(`${preset.vendor}/${preset.region}`) ?? [],
  }))
}

/**
 * Durable voice model fields, shared by the Host Config (which marks them
 * volatile so the browser scope can read them) and the wire envelope below.
 */
export const SdkworkVoiceModelsFields = {
  [DEFAULT_PROVIDER_FIELD]: z.string().default(''),
  // The seeded rows are the section default rather than a startup write: a
  // deployment that never opens the page still resolves the full vendor list,
  // and the projected document then states which vendors exist.
  [PROVIDERS_FIELD]: z.array(providerSchema()).default(defaultVoiceProviders()),
  [WRITE_SECRETS_FIELD]: z.boolean().default(false),
}

/** Durable voice model schema; also the wire envelope the browser scope validates against. */
export const SdkworkVoiceModelsSchema: z<SdkworkVoiceModelsSettings> = z.object(SdkworkVoiceModelsFields)

/**
 * Project the section into the skill-facing document.
 *
 * Pure by construction: the Host writes exactly what this returns, so the file
 * a skill reads and the value the settings page shows can never drift. Secrets
 * ride the projection only when the section opts in — a skill that needs the
 * key normally reads the named environment variable instead.
 * @param settings - the effective section, as the Host resolved it.
 * @param options - projection instant, and whether literal keys are included.
 * @returns the document to write.
 */
export function projectVoiceModelsDocument(
  settings: SdkworkVoiceModelsSnapshot,
  options: { updatedAt: string; writeSecrets: boolean },
): SdkworkVoiceModelsDocument {
  return {
    schemaVersion: SDKWORK_MODELS_FILE_SCHEMA_VERSION,
    kind: VOICE_MODELS_FILE_KIND,
    plugin: VOICE_MODELS_NAMESPACE,
    modality: 'voice',
    updatedAt: options.updatedAt,
    defaultProviderId: settings[DEFAULT_PROVIDER_FIELD],
    writeSecrets: options.writeSecrets,
    providers: settings[PROVIDERS_FIELD].map(provider => ({
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      vendor: provider.vendor,
      protocol: provider.protocol,
      region: provider.region,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      credential: {
        env: provider.apiKeyEnv,
        stored: provider.apiKey !== '',
        ...options.writeSecrets && provider.apiKey !== '' ? { value: provider.apiKey } : {},
      },
      models: provider.models.map(model => ({
        id: model.id,
        displayName: model.displayName,
        catalogKey: model.catalogKey,
        enabled: model.enabled,
        voiceId: model.voiceId,
        format: model.format,
        speed: model.speed,
        language: model.language,
      })),
    })),
  }
}

/**
 * Serialize the projected document exactly as the file carries it: two-space
 * JSON, one trailing newline, so a hand-diff of two projections is readable.
 * @param document - the projected document.
 * @returns the file text.
 */
export function serializeVoiceModelsDocument(document: SdkworkVoiceModelsDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`
}
