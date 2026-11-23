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
 * Each route speaks the OpenRouter wire dialect and seeds from the SDKWork
 * models catalog — every current general-purpose chat model the catalog offers,
 * in the catalog's own mainstream order, with the DeepSeek block first.
 * Deprecated, retired, hidden, and replaced catalog rows never seed, and neither
 * does a row the catalog keeps off code surfaces (`codingVisible: false`: OCR,
 * translation, role-play, character, live audio, or robotics), because a coding
 * picker must not offer a specialized endpoint as a general LLM. The seed module
 * is generated (`relay-models.generated.ts`, projected by
 * `scripts/generate-sdkwork-relay-models.mjs`), so a catalog bump refreshes
 * what the picker offers instead of leaving a hand-kept list behind. A seed
 * model borrows the wire facts and compatibility block of the same model in
 * the installed OpenRouter catalog when pi-ai describes it — under its own id,
 * or by composed display name when the installed catalog renamed the id — and
 * otherwise states only what the SDKWork catalog states. The endpoint's own
 * `GET /models` (the Models page "fetch models" action) remains the authority
 * on what a deployment actually serves.
 *
 * @module dsh-llm-pi-ai/relay
 */

import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import type { Api, ApiKeyAuth, Model, ModelCost, Provider } from '@earendil-works/pi-ai'
import { RELAY_MODEL_PRESETS } from './relay-models.generated.ts'
import type { SdkworkRelayModelPreset } from './relay-models.generated.ts'
import { relayCatalogPolicy } from './relay-catalog-policy.ts'

export { RELAY_MODEL_CATALOG_VERSION } from './relay-models.generated.ts'

/**
 * Pricing for a seed model. The harness never reads pi-ai's cost metadata —
 * `replay.ts` zeroes it and no consumer reports spend — and the relay's own
 * prices are not the OpenRouter entry's, so the seed states no price rather
 * than borrowing a rate from another vendor.
 */
const NO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/**
 * Capacities a seed model falls back to when neither the SDKWork catalog nor
 * the installed pi-ai catalog states one. A catalog row without capacities is
 * still routable; these are the conservative window and output cap the relay
 * effectively served before the catalog stated them.
 */
const FALLBACK_CONTEXT_WINDOW = 128_000
const FALLBACK_MAX_TOKENS = 32_768

/**
 * One harness-shipped relay route: an OpenAI-compatible gateway pi-ai's
 * catalog does not know, which this distribution ships anyway.
 */
export interface HarnessRelayEntry {
  /** Name shown by configuration surfaces once the route has a profile. */
  displayName: string
  /**
   * The relay's OpenAI-compatible endpoint, `https://<host>/v1`. The Chat
   * Completions and Responses faces speak here.
   */
  baseUrl: string
  /**
   * The relay's Anthropic Messages endpoint, `https://<host>/anthropic`.
   * Anthropic's SDK appends `/v1/messages`, so this is the base it takes.
   */
  anthropicBaseUrl: string
  /** Default wire protocol; every seed model starts on it. */
  api: string
  /** Seed models in picker order, projected from the SDKWork models catalog. */
  models: readonly SdkworkRelayModelPreset[]
}

/** The OpenAI Chat Completions protocol. */
const COMPLETIONS_API = 'openai-completions'

/** The Anthropic Messages protocol. */
const MESSAGES_API = 'anthropic-messages'

/**
 * The harness-shipped relay routes, keyed by provider route. Both seed from
 * the same SDKWork catalog projection; a deployment whose relay differs
 * overrides per profile. BirdCoder serves Anthropic Messages by default
 * because its gateway is built for Claude Code first; the OpenAI Responses
 * (Codex) and Chat Completions faces remain selectable through a profile's
 * `api`.
 */
const HARNESS_RELAYS: Readonly<Record<string, HarnessRelayEntry>> = {
  sdkwork: {
    displayName: 'SDKWork',
    baseUrl: 'https://api.sdkwork.com/v1',
    anthropicBaseUrl: 'https://api.sdkwork.com/anthropic',
    api: COMPLETIONS_API,
    models: RELAY_MODEL_PRESETS,
  },
  birdcoder: {
    displayName: 'BirdCoder',
    baseUrl: 'https://api.birdcoder.com/v1',
    anthropicBaseUrl: 'https://api.birdcoder.com/anthropic',
    api: MESSAGES_API,
    models: RELAY_MODEL_PRESETS,
  },
}

/**
 * The endpoint one protocol speaks on. The OpenAI faces use the relay's `/v1`
 * base unchanged, because their SDKs append `/chat/completions` or
 * `/responses`; Anthropic's SDK appends `/v1/messages`, so its base is the
 * sibling `/anthropic` endpoint.
 * @param entry - the harness relay route.
 * @param api - the wire protocol whose endpoint is wanted.
 * @returns the endpoint that protocol's SDK takes as its base URL.
 */
function protocolBase(entry: HarnessRelayEntry, api: string): string {
  return api === MESSAGES_API ? entry.anthropicBaseUrl : entry.baseUrl
}

/**
 * The endpoint one protocol of a harness-shipped relay speaks on.
 * @param provider - provider route key.
 * @param api - the wire protocol whose endpoint is wanted.
 * @returns that protocol's base URL, or `undefined` for a route the harness does not ship.
 */
export function harnessRelayBase(provider: string, api: string): string | undefined {
  const entry = harnessRelay(provider)
  return entry === undefined ? undefined : protocolBase(entry, api)
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
 * The installed OpenRouter catalog by model id, read once. A seed borrows the
 * wire facts this catalog records for the same model — compatibility
 * switches, thinking dispatch, image limits — when it describes one.
 * @returns the catalog models indexed by id.
 */
function openRouterCatalog(): Map<string, Model<Api>> {
  seedSource ??= new Map((getBuiltinModels('openrouter') as Model<Api>[]).map(model => [model.id, model]))
  return seedSource
}

/**
 * Vendor codes the installed OpenRouter catalog spells differently from the
 * SDKWork models catalog. A seed borrows facts by model id, so both spellings
 * are tried against the installed catalog.
 */
const OPENROUTER_VENDOR_ALIASES: Readonly<Record<string, readonly string[]>> = {
  alibaba: ['qwen'],
  moonshot: ['moonshotai'],
  xai: ['x-ai'],
  zhipu: ['z-ai'],
}

/**
 * Catalog keys the installed OpenRouter catalog may describe one SDKWork
 * catalog model under: the catalog's own `<vendor>/<modelId>`, each vendor
 * alias, and the dotted version spelling OpenRouter uses for hyphenated model
 * ids (`claude-opus-4-5` is `claude-opus-4.5` there).
 * @param preset - one SDKWork catalog row.
 * @returns candidate ids in preference order, without duplicates.
 */
function openRouterCandidates(preset: SdkworkRelayModelPreset): string[] {
  const dotted = /^(.*)-(\d+)$/u.exec(preset.modelId)
  const modelIds = dotted === null ? [preset.modelId] : [preset.modelId, `${dotted[1]}.${dotted[2]}`]
  const vendors = [preset.vendorCode, ...(OPENROUTER_VENDOR_ALIASES[preset.vendorCode] ?? [])]
  return [...new Set(vendors.flatMap(vendor => modelIds.map(id => `${vendor}/${id}`)))]
}

/**
 * The installed catalog entry describing one SDKWork catalog model, when
 * pi-ai knows it. That entry is the only source of the wire facts the SDKWork
 * catalog does not carry: compatibility switches, thinking dispatch, and
 * image limits. An id the installed catalog has renamed is matched by its
 * composed display name instead.
 * @param preset - one SDKWork catalog row.
 * @returns the borrowed entry, or `undefined` when pi-ai does not describe it.
 */
function borrowedSeed(preset: SdkworkRelayModelPreset): Model<Api> | undefined {
  const source = openRouterCatalog()
  for (const id of openRouterCandidates(preset)) {
    const model = source.get(id)
    if (model !== undefined) return model
  }
  return nameMatchedSeed(preset)
}

/**
 * The installed catalog entry carrying one SDKWork catalog model's wire facts
 * under a renamed id.
 *
 * The installed catalog sometimes spells the same model differently — the
 * SDKWork catalog's `deepseek/deepseek-flash` is OpenRouter's
 * `deepseek/deepseek-v4.1-flash` — so an id lookup misses and the seed would
 * lose the model's thinking dispatch. Fall back to the composed display name
 * (`<vendorName>: <displayName>`) inside the same vendor family, and accept it
 * only when exactly one entry claims that name.
 * @param preset - one SDKWork catalog row.
 * @returns the borrowed entry, or `undefined` when no single entry matches.
 */
function nameMatchedSeed(preset: SdkworkRelayModelPreset): Model<Api> | undefined {
  const wanted = `${preset.vendorName}: ${preset.displayName}`
  const vendors = [preset.vendorCode, ...(OPENROUTER_VENDOR_ALIASES[preset.vendorCode] ?? [])]
  let match: Model<Api> | undefined
  for (const model of openRouterCatalog().values()) {
    if (model.name !== wanted) continue
    if (!vendors.some(vendor => model.id.startsWith(`${vendor}/`))) continue
    if (match !== undefined) return undefined
    match = model
  }
  return match
}

/**
 * One borrowed entry without its `compat` block, which describes the protocol
 * that entry speaks and must not travel to a route speaking another one.
 * @param model - the borrowed installed entry.
 * @returns the entry's facts without `compat`.
 */
function withoutCompat(model: Model<Api>): Omit<Model<Api>, 'compat'> {
  const { compat: _compat, ...facts } = model
  return facts
}

/**
 * One seed model, stamped to the route. The SDKWork catalog owns the id, name,
 * and capacities; a borrowed pi-ai entry contributes the wire facts the
 * catalog omits. A model pi-ai does not describe still seeds — it just carries
 * no reasoning dispatch and no compatibility switches.
 * @param provider - harness relay route key.
 * @param entry - the harness relay route whose seeds to materialize.
 * @param preset - one catalog row.
 * @returns the route's seed model.
 */
function seedModel(provider: string, entry: HarnessRelayEntry, preset: SdkworkRelayModelPreset): Model<Api> {
  const borrowed = borrowedSeed(preset)
  const compatApplies = borrowed !== undefined && borrowed.api === entry.api
  return {
    ...(borrowed === undefined ? {} : compatApplies ? borrowed : withoutCompat(borrowed)),
    id: preset.catalogKey,
    name: `${preset.vendorName}: ${preset.displayName}`,
    provider,
    baseUrl: protocolBase(entry, entry.api),
    api: entry.api,
    input: preset.input.length > 0 ? [...preset.input] : (borrowed?.input ?? ['text']),
    cost: NO_COST,
    reasoning: borrowed?.reasoning ?? false,
    contextWindow: preset.contextWindow > 0
      ? preset.contextWindow
      : (borrowed?.contextWindow ?? FALLBACK_CONTEXT_WINDOW),
    maxTokens: preset.maxTokens > 0 ? preset.maxTokens : (borrowed?.maxTokens ?? FALLBACK_MAX_TOKENS),
  }
}

let seedIndex: Map<string, Map<string, Model<Api>>> | undefined

/**
 * Every relay route's seed models by id, materialized once. The picker and
 * request resolution both read this index, so the generated catalog order is
 * what every surface shows.
 * @returns the seed models per route.
 */
function relaySeedIndex(): Map<string, Map<string, Model<Api>>> {
  seedIndex ??= new Map(Object.entries(HARNESS_RELAYS).map(([provider, entry]) => [
    provider,
    new Map(entry.models.map(preset => seedModel(provider, entry, preset)).map(model => [model.id, model])),
  ]))
  return seedIndex
}

let relayIndex: Map<string, Provider> | undefined

/**
 * One relay model for a catalog key the build-time seed does not describe.
 *
 * The operator can expose a model a vendor published after this build shipped,
 * so the runtime document may name an unknown key. A minimal OpenAI-compatible
 * entry keeps that model selectable and routable without pretending to know
 * capacities nobody declared; the first request that exercises it fails with
 * the provider's own answer if the deployment does not serve it.
 * @param provider - harness relay route key.
 * @param entry - the harness relay route whose catalog is being materialized.
 * @param catalogKey - `<vendorCode>/<modelId>` key the document named.
 * @returns a minimal relay model for that key.
 */
function remoteSeedModel(provider: string, entry: HarnessRelayEntry, catalogKey: string): Model<Api> {
  return {
    id: catalogKey,
    name: catalogKey,
    provider,
    baseUrl: protocolBase(entry, entry.api),
    api: entry.api,
    input: ['text'],
    cost: NO_COST,
    reasoning: false,
    contextWindow: FALLBACK_CONTEXT_WINDOW,
    maxTokens: FALLBACK_MAX_TOKENS,
  }
}

/**
 * One route's catalog after the operator policy, if one is published.
 *
 * The policy is an ordered allow-list: its order is the picker order, keys the
 * seed knows keep their seed facts, and keys it does not know become minimal
 * relay entries. No policy leaves the seed untouched; an empty policy is an
 * explicit "expose nothing" and returns an empty catalog.
 * @param provider - harness relay route key.
 * @param entry - the harness relay route.
 * @param seed - the route's build-time seed models by id.
 * @returns the effective catalog by id, in policy order.
 */
function policyModels(
  provider: string,
  entry: HarnessRelayEntry,
  seed: ReadonlyMap<string, Model<Api>>,
): Map<string, Model<Api>> {
  const policy = relayCatalogPolicy(provider)
  if (policy === undefined) return new Map(seed)
  const models = new Map<string, Model<Api>>()
  for (const catalogKey of policy.catalogKeys) {
    models.set(catalogKey, seed.get(catalogKey) ?? remoteSeedModel(provider, entry, catalogKey))
  }
  return models
}

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
    // The default protocol decides the implementation; a profile repointing the
    // route at another protocol is served by provider construction's protocol
    // table instead of this reused provider.
    const api = entry.api === MESSAGES_API ? anthropicMessagesApi() : openAICompletionsApi()
    return [provider, {
      id: provider,
      name: entry.displayName,
      baseUrl: protocolBase(entry, entry.api),
      auth: { apiKey: harnessApiKeyAuth(entry.displayName) },
      // Read through the policy seam on every call: the operator's exposure
      // document can change without rebuilding this provider.
      getModels: () => [...(harnessModels(provider)?.values() ?? [])],
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
 *
 * The build-time seed stays the base catalog; a published operator policy
 * replaces its ordering and membership. The returned map is a fresh copy, so a
 * caller may keep it while a later publication changes the route's catalog.
 * @param provider - provider route key.
 * @returns the effective models by id in presentation order (seed order without
 *   a policy), or `undefined` for a route the harness does not ship.
 */
export function harnessModels(provider: string): Map<string, Model<Api>> | undefined {
  const seed = relaySeedIndex().get(provider)
  if (seed === undefined) return undefined
  const entry = harnessRelay(provider)
  if (entry === undefined) return new Map(seed)
  return policyModels(provider, entry, seed)
}
