/**
 * Video model configuration plugin, browser half: owns the `settings.section`
 * contribution that renders the page, and the only writer of the
 * `ui-sdkwork-video-models` settings section.
 *
 * The page reads the durable section through the shared configuration form and
 * writes it back through the same scope, so there is one authority and no
 * second copy: a write the Host refuses leaves the page showing the stored
 * value. The injected face is intent-shaped (`saveProvider`, `removeProvider`,
 * `addRelay`, …) rather than value-shaped, because computing the next provider
 * array needs the *current* one — which lives here, next to the scope, not in
 * render code.
 *
 * The projection path the Host resolved is published as a page global before
 * browser plugins activate, exactly like the deployment environment: the browser
 * cannot read the Host filesystem, and the page has to name the file a skill
 * reads.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ctx.configForms and the settings.section slot declaration into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  DEFAULT_PROVIDER_FIELD, PROVIDERS_FIELD, VIDEO_MODELS_FILE_GLOBAL, VIDEO_MODELS_NAMESPACE, WRITE_SECRETS_FIELD,
  type SdkworkVideoModel, type SdkworkVideoModelsSettings, type SdkworkVideoProvider,
} from '../video-models-settings.ts'
import { VideoModelsSection } from './VideoModelsSection.tsx'
import type { VideoModelsSectionInjected, VideoProviderInput } from './VideoModelsSection.tsx'
import {
  createVideoModelsSectionStore, type VideoModelsStatus, type VideoProviderRow,
} from './video-models-store.ts'
import { en, zh } from './locales.ts'

export type { VideoModelsSectionInjected, VideoModelsSectionProps, VideoModelInput, VideoProviderInput } from './VideoModelsSection.tsx'
export type {
  VideoModelsSectionState, VideoModelsStatus, VideoModelRow, VideoProviderRow,
} from './video-models-store.ts'
export type { VideoModelsKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'sdkworkVideoModels'

/** Services this plugin consumes: the slot registry, the locale registry, and the settings forms. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Read the projection path the Host published to this page.
 * @param value - the page global's value.
 * @returns the absolute path, or the empty string when the payload is unusable.
 */
function decodeFilePath(value: unknown): string {
  if (typeof value !== 'object' || value === null) return ''
  const path = (value as { path?: unknown }).path
  return typeof path === 'string' ? path : ''
}

/**
 * Project the section's provider rows into the page's row shape.
 * @param settings - the resolved section, when one stands.
 * @returns the rows, with the credential reduced to its presence.
 */
function projectProviders(settings: SdkworkVideoModelsSettings | undefined): readonly VideoProviderRow[] {
  if (settings === undefined) return []
  return settings[PROVIDERS_FIELD].map(provider => ({
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    vendor: provider.vendor,
    protocol: provider.protocol,
    region: provider.region,
    baseUrl: provider.baseUrl,
    apiKeyEnv: provider.apiKeyEnv,
    hasApiKey: provider.apiKey !== '',
    enabled: provider.enabled,
    models: provider.models.map(model => ({
      id: model.id,
      displayName: model.displayName,
      catalogKey: model.catalogKey,
      enabled: model.enabled,
      generationMode: model.generationMode,
      resolution: model.resolution,
      aspectRatio: model.aspectRatio,
      durationSeconds: model.durationSeconds,
      outputAudio: model.outputAudio,
    })),
  }))
}

/**
 * Copy one resolved provider row into a writable shape.
 * @param provider - the row as the section carries it.
 * @returns a detached row that can be mutated into the next section value.
 */
function copyProvider(provider: SdkworkVideoProvider): SdkworkVideoProvider {
  return { ...provider, models: provider.models.map(model => ({ ...model })) }
}

/**
 * Mint an id for a new relay row: the first unused `relay-<n>`, so the id is
 * stable across sessions and never derived from a clock or a random source.
 * @param providers - the rows already in the section.
 * @returns the new row's id.
 */
export function nextRelayId(providers: readonly SdkworkVideoProvider[]): string {
  const used = new Set(providers.map(provider => provider.id))
  let index = 1
  while (used.has(`relay-${index}`)) index += 1
  return `relay-${index}`
}

/**
 * Merge one submitted provider row into the section.
 *
 * An absent `apiKey` keeps the stored one: the page never receives the stored
 * key, so a save that did not touch the field must not erase it. An empty
 * string is the explicit clear.
 * @param providers - the current rows.
 * @param input - the submitted row.
 * @returns the next rows.
 */
export function mergeProvider(
  providers: readonly SdkworkVideoProvider[],
  input: VideoProviderInput,
): SdkworkVideoProvider[] {
  const stored = providers.find(provider => provider.id === input.id)
  const models: SdkworkVideoModel[] = input.models.map(model => ({ ...model }))
  const merged: SdkworkVideoProvider = {
    id: input.id,
    label: input.label,
    kind: input.kind,
    vendor: input.vendor,
    protocol: input.protocol,
    region: input.region,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey ?? stored?.apiKey ?? '',
    apiKeyEnv: input.apiKeyEnv,
    enabled: input.enabled,
    models,
  }
  const at = providers.findIndex(provider => provider.id === input.id)
  if (at < 0) return [...providers.map(copyProvider), merged]
  return providers.map((provider, index) => index === at ? merged : copyProvider(provider))
}

/**
 * Register the video model settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-video-models: dictionaries')

  const scope = ctx.configForms.get<SdkworkVideoModelsSettings>(VIDEO_MODELS_NAMESPACE)
  const store = createVideoModelsSectionStore()
  // Bound once the renderer mounts the page; every writer below tolerates the
  // page being closed (the store simply carries no listeners yet).
  let actions: BoundActions<typeof store> | undefined

  const project = (): void => {
    const snapshot = scope.getSnapshot()
    const value = snapshot.status === 'ready' ? snapshot.value : undefined
    const status: VideoModelsStatus = snapshot.status
    actions?.mirror({
      status,
      writable: status === 'ready' && snapshot.writable,
      defaultProviderId: value?.[DEFAULT_PROVIDER_FIELD] ?? '',
      providers: projectProviders(value),
    })
    actions?.writeSecrets(value?.[WRITE_SECRETS_FIELD] ?? false)
  }
  ctx.effect(() => scope.subscribe(project), 'ui-sdkwork-video-models: scope mirror')

  /**
   * Commit one section field, reporting the write through the store so the page
   * can say a save is in flight and whether it landed.
   * @param field - the section field to write.
   * @param value - the value to store.
   */
  const commit = async (field: string, value: unknown): Promise<void> => {
    actions?.writing()
    let accepted = false
    try {
      accepted = await scope.set(field, value)
    } catch (error) {
      console.error('[ui-sdkwork-video-models] settings write failed:', error)
    } finally {
      actions?.settled(accepted)
    }
  }

  /**
   * Read the writable rows off the accepted section.
   * @returns the current provider rows, detached.
   */
  const readProviders = (): SdkworkVideoProvider[] => {
    const value = scope.getSnapshot().value
    return value === undefined ? [] : value[PROVIDERS_FIELD].map(copyProvider)
  }

  const sectionInjected = (bound: BoundActions<typeof store>): VideoModelsSectionInjected => {
    actions = bound
    // Re-sync at registration so no snapshot is lost between the apply-world
    // subscription above and the first render.
    project()
    actions.file(decodeFilePath(
      (globalThis as Partial<Record<typeof VIDEO_MODELS_FILE_GLOBAL, unknown>>)[VIDEO_MODELS_FILE_GLOBAL],
    ))
    return {
      saveProvider: (provider) => { void commit(PROVIDERS_FIELD, mergeProvider(readProviders(), provider)) },
      setProviderEnabled: (id, enabled) => {
        const providers = readProviders().map((provider) => {
          if (provider.id !== id) return provider
          return { ...provider, enabled }
        })
        void commit(PROVIDERS_FIELD, providers)
      },
      removeProvider: (id) => {
        void commit(PROVIDERS_FIELD, readProviders().filter(provider => provider.id !== id))
      },
      addRelay: () => {
        const providers = readProviders()
        void commit(PROVIDERS_FIELD, [...providers, {
          id: nextRelayId(providers),
          label: '',
          kind: 'relay',
          vendor: '',
          protocol: 'openai_compatible',
          region: '',
          baseUrl: '',
          apiKey: '',
          apiKeyEnv: '',
          enabled: true,
          models: [],
        }])
      },
      setDefaultProvider: (id) => { void commit(DEFAULT_PROVIDER_FIELD, id) },
      setWriteSecrets: (enabled) => { void commit(WRITE_SECRETS_FIELD, enabled) },
    }
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    // After the other modality pages in this fork, so the four read as one
    // block: upstream Models (10), Skills (12), Agent presets (20), then the
    // modality pages (21–24), with no two pages sharing an order.
    id: 'video-models',
    order: 22,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    store,
    inject: sectionInjected,
  }, VideoModelsSection))
}
