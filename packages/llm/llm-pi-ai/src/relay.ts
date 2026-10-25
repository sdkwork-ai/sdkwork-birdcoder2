/**
 * The relay routes this build ships as catalog members.
 *
 * `sdkwork` and `birdcoder` are OpenAI-compatible relay services like
 * OpenRouter, at `https://api.sdkwork.com/v1` and `https://api.birdcoder.com/v1`.
 * Neither exists in the installed pi-ai catalog, and a route pi-ai does not
 * ship is normally declared per-deployment in `settings.yaml`, which would
 * leave both invisible on the Models page until someone wrote a profile by
 * hand. Shipping them here makes each one a catalog route for every downstream
 * reader: offered in the add-provider dropdown before any configuration,
 * activated by storing an API key, and served from a seed catalog.
 *
 * Each route speaks the OpenRouter wire dialect and seeds from the installed
 * OpenRouter catalog entries of the same ids, so a seed model carries the
 * capacities, modalities, and reasoning dispatch that catalog records without
 * duplicating catalog data. The seed is a curated subset, not an authoritative
 * list — the endpoint's own `GET /models` (the Models page "fetch models"
 * action) answers the complete set.
 *
 * @module dsh-llm-pi-ai/relay
 */

import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import type { Api, ApiKeyAuth, Model, ModelCost, Provider } from '@earendil-works/pi-ai'

/**
 * Pricing for a seed model. The harness never reads pi-ai's cost metadata —
 * `replay.ts` zeroes it and no consumer reports spend — and the relay's own
 * prices are not the OpenRouter entry's, so the seed states no price rather
 * than borrowing a rate from another vendor.
 */
const NO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/**
 * One harness-shipped relay route: an OpenAI-compatible gateway pi-ai's
 * catalog does not know, which this distribution ships anyway.
 */
export interface HarnessRelayEntry {
  /** Name shown by configuration surfaces once the route has a profile. */
  displayName: string
  /** Endpoint serving this route's models. */
  baseUrl: string
  /** The wire protocol every model on this route speaks. */
  api: string
  /** Seed model ids, each an installed OpenRouter catalog entry. */
  models: readonly string[]
}

/** The wire protocol the harness relays speak (and their seeds borrow). */
const RELAY_API = 'openai-completions'

/**
 * Seed ids for the harness relays: the mainstream models an OpenRouter-style
 * relay serves, named as the installed OpenRouter catalog names them. Every
 * fact beyond the id comes from that catalog entry. A relay serving more
 * models reaches them through the endpoint's own listing or through a
 * profile's `models` list.
 */
const RELAY_SEED_MODELS: readonly string[] = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4.1',
  'anthropic/claude-opus-4.5',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-r1',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'qwen/qwen3.7-max',
  'z-ai/glm-4.6',
  'moonshotai/kimi-k2',
  'x-ai/grok-4.5',
]

/**
 * The harness-shipped relay routes, keyed by provider route. Both speak the
 * OpenRouter dialect and seed from the same mainstream list; a deployment
 * whose relay differs overrides per profile.
 */
const HARNESS_RELAYS: Readonly<Record<string, HarnessRelayEntry>> = {
  sdkwork: {
    displayName: 'SDKWork',
    baseUrl: 'https://api.sdkwork.com/v1',
    api: RELAY_API,
    models: RELAY_SEED_MODELS,
  },
  birdcoder: {
    displayName: 'BirdCoder',
    baseUrl: 'https://api.birdcoder.com/v1',
    api: RELAY_API,
    models: RELAY_SEED_MODELS,
  },
}

/**
 * The harness-shipped relay entry for one route, when the harness ships one.
 * @param provider - provider route key.
 * @returns the relay entry, or `undefined` for a route the harness does not ship.
 */
export function harnessRelay(provider: string): HarnessRelayEntry | undefined {
  return HARNESS_RELAYS[provider]
}

/**
 * Every harness-shipped relay route key.
 * @returns the relay route keys in declaration order.
 */
export function harnessRelayIds(): readonly string[] {
  return Object.keys(HARNESS_RELAYS)
}

/**
 * Api-key auth for a route the harness authenticates itself. `Models` calls
 * this after the adapter has already resolved the route's credential, so a
 * missing key here is not this layer's failure: a named-but-unresolvable
 * reference has already failed the request with `MISSING_CREDENTIAL`, and a
 * route naming no credential at all is deliberately unauthenticated. Reporting
 * it as configured hands the decision to the protocol, which is where the
 * requirement actually lives — pi-ai's OpenAI-compatible implementation, for
 * one, still insists on a key or an `Authorization` header of its own.
 * @param name - display name used as the resolution's status label.
 * @returns the api-key auth for a harness-authenticated route.
 */
export function harnessApiKeyAuth(name: string): ApiKeyAuth {
  return {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  }
}

let seedSource: Map<string, Model<Api>> | undefined

/**
 * The installed OpenRouter catalog by model id, read once. Both relays borrow
 * their seed facts from it, so neither duplicates capacities or modalities.
 * @returns the catalog models indexed by id.
 */
function openRouterCatalog(): Map<string, Model<Api>> {
  seedSource ??= new Map((getBuiltinModels('openrouter') as Model<Api>[]).map(model => [model.id, model]))
  return seedSource
}

/**
 * One relay's seed models, stamped to the route. Every seed id must exist in
 * the installed catalog: a pi-ai upgrade that renames or drops a seed would
 * otherwise quietly serve fewer models than this build ships, so it fails loud
 * naming the ids instead.
 *
 * A borrowed entry's `compat` block describes the protocol that entry speaks.
 * It travels only while the relay speaks that same protocol, because an
 * `anthropic-messages` compatibility block would otherwise be read by the
 * OpenAI Chat Completions implementation as if it were its own.
 * @param provider - harness relay route key.
 * @param entry - the harness relay route whose seeds to materialize.
 * @returns the route's seed models in seed order.
 */
function seedModels(provider: string, entry: HarnessRelayEntry): Model<Api>[] {
  const source = openRouterCatalog()
  const missing = entry.models.filter(id => !source.has(id))
  if (missing.length > 0) {
    throw new Error(
      `llm-pi-ai: harness relay "${provider}" seeds model ids the installed openrouter catalog does`
      + ` not describe: ${missing.join(', ')}; update the seed list in src/relay.ts`,
    )
  }
  return entry.models.map((id) => {
    // The drift gate above guarantees the entry exists.
    const base = source.get(id) as Model<Api>
    const { compat, ...facts } = base
    return {
      ...facts,
      provider,
      baseUrl: entry.baseUrl,
      api: entry.api,
      cost: NO_COST,
      ...base.api === entry.api && compat !== undefined ? { compat } : {},
    }
  })
}

let relayIndex: Map<string, Provider> | undefined

/**
 * The harness-shipped relay providers by route, constructed once. A harness
 * route is a catalog route for every downstream reader — provider construction
 * reuses this provider exactly as it reuses an installed one — so it mirrors
 * the installed providers' shape with the api-key method the harness resolves
 * itself.
 * @returns the harness relay provider index.
 */
function relayProviders(): Map<string, Provider> {
  relayIndex ??= new Map<string, Provider>(Object.entries(HARNESS_RELAYS).map(([provider, entry]) => {
    const api = openAICompletionsApi()
    const models = seedModels(provider, entry)
    return [provider, {
      id: provider,
      name: entry.displayName,
      baseUrl: entry.baseUrl,
      auth: { apiKey: harnessApiKeyAuth(entry.displayName) },
      getModels: () => models,
      stream: (model, context, options) => api.stream(model, context, options),
      streamSimple: (model, context, options) => api.streamSimple(model, context, options),
    }]
  }))
  return relayIndex
}

/**
 * The harness-shipped relay provider for one route, when the harness ships one.
 * @param provider - provider route key.
 * @returns the relay provider, or `undefined` for a route the harness does not ship.
 */
export function harnessProvider(provider: string): Provider | undefined {
  if (harnessRelay(provider) === undefined) return undefined
  return relayProviders().get(provider)
}

/**
 * The harness-shipped relay models for one route, when the harness ships one.
 * @param provider - provider route key.
 * @returns the seed models by id, or `undefined` for a route the harness does not ship.
 */
export function harnessModels(provider: string): Map<string, Model<Api>> | undefined {
  const entry = harnessRelay(provider)
  if (entry === undefined) return undefined
  return new Map(seedModels(provider, entry).map(model => [model.id, model]))
}
