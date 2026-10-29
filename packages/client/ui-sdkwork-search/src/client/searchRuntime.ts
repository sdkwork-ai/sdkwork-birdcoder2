/**
 * BirdCoder host runtime for the SDKWork Search capability.
 *
 * The page queries through the SDKWork Search service facade
 * (`@sdkwork/search-service`), which owns query ranking, grouping, and paging:
 *
 * - The local query always runs over the BirdCoder capability catalog this
 *   plugin builds, so the page answers signed out and offline.
 * - The remote query runs over the SDKWork Search application index through the
 *   generated app SDK (`@sdkwork/search-app-sdk`) whenever the deployment
 *   carries credentials — an IAM session or the environment bootstrap access
 *   token. Its success payload arrives untyped on the wire, so this module
 *   normalizes it at that boundary and drops malformed rows; a transport or
 *   protocol failure degrades the page to local results instead of failing the
 *   whole query.
 *
 * The SDKWork packages supply values only; every type this module exports is
 * declared here, so the package's emitted declarations never reach into
 * sibling source.
 */
import { createSdkworkSearchService, type SdkworkSearchAppQueryBody } from '@sdkwork/search-service'
import type {
  SdkworkSearchDocument, SdkworkSearchQueryResponse, SdkworkSearchResult,
} from '@sdkwork/search-contracts'
import { createClient as createSearchAppClient } from '@sdkwork/search-app-sdk'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import type { SearchCatalog, SearchDestination } from './catalog.ts'

/** How many hits one query asks each source for. */
const PAGE_SIZE = 20

/** Which document set produced a result. */
export type SearchResultOrigin = 'local' | 'remote'

/** One rendered search hit. */
export interface SearchResultItem {
  /** Stable document id from the producing source. */
  readonly id: string
  /** Document title. */
  readonly title: string
  /** Optional one-line summary. */
  readonly description?: string
  /** Which source produced the hit. */
  readonly origin: SearchResultOrigin
  /** Navigation target, absent when the hit names no surface this client renders. */
  readonly destination?: SearchDestination
}

/** One rendered result section. */
export interface SearchResultGroup {
  /** Group id unique across sources. */
  readonly id: string
  /** Section heading as the producing source labels it, empty when unlabeled. */
  readonly heading: string
  /** Hits in rank order. */
  readonly results: readonly SearchResultItem[]
}

/** One completed query. */
export interface SearchOutcome {
  /** Result sections: local catalog sections first, then SDKWork index sections. */
  readonly groups: readonly SearchResultGroup[]
  /** Total hits across every section. */
  readonly total: number
  /** True when the SDKWork index query was attempted and failed. */
  readonly degraded: boolean
}

/** Query face the page consumes. */
export interface SearchRuntime {
  /**
   * Run one query over the local catalog and, when credentials exist, the
   * SDKWork Search index.
   * @param query - raw user input; blank input resolves to an empty outcome.
   * @returns the merged, grouped outcome.
   */
  run(query: string): Promise<SearchOutcome>
  /** Release the cached SDKWork client. */
  dispose(): void
}

/** Environment values the runtime reads on every query. */
export interface SearchRuntimeEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, empty when unset. */
  accessToken(): string
}

/** Host session fields the runtime forwards to the shared SDKWork token manager. */
export interface SearchRuntimeSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** IAM face the runtime reads on every query. */
export interface SearchRuntimeIam {
  controller: {
    /** @returns the current session, or null when signed out. */
    getState(): { session: SearchRuntimeSession | null }
  }
}

/** Runtime dependencies. */
export interface SearchRuntimeOptions {
  /** Active BirdCoder deployment environment. */
  readonly env: SearchRuntimeEnvironment
  /** Active BirdCoder IAM session provider. */
  readonly iam: SearchRuntimeIam
  /** @returns the locale-resolved local catalog for the current dictionaries. */
  readonly catalog: () => SearchCatalog
}

/** One SDKWork index query result, or the fact that it could not be read. */
type RemoteQuery = { readonly response: SdkworkSearchQueryResponse } | { readonly failed: true }

/** Runtime implementation; owns the cached generated app client. */
class SearchRuntimeImpl implements SearchRuntime {
  private clientBaseUrl: string | undefined
  private client: ReturnType<typeof createSearchAppClient> | undefined
  private disposed = false

  constructor(private readonly options: SearchRuntimeOptions) {}

  /** Run one query over both sources. */
  async run(query: string): Promise<SearchOutcome> {
    const text = query.trim()
    if (text === '') return { groups: [], total: 0, degraded: false }
    const catalog = this.options.catalog()
    const local = await queryLocal(catalog, text)
    const remote = this.hasCredentials() ? await this.queryRemote(text) : undefined
    const remoteResults = remote === undefined || 'failed' in remote ? [] : remote.response.items
    const groups = [
      ...toGroups('local', local, catalog),
      ...toGroups('remote', remoteResults, catalog),
    ]
    const total = groups.reduce((count, group) => count + group.results.length, 0)
    return { groups, total, degraded: remote !== undefined && 'failed' in remote }
  }

  /** Release the cached client; later queries run over the local catalog only. */
  dispose(): void {
    this.disposed = true
    this.client = undefined
    this.clientBaseUrl = undefined
  }

  /** @returns whether the deployment can reach the SDKWork Search index. */
  private hasCredentials(): boolean {
    if (this.disposed) return false
    if (this.options.env.apiBaseUrl().trim() === '') return false
    const session = this.options.iam.controller.getState().session
    return session !== null || this.options.env.accessToken().trim() !== ''
  }

  /** Query the SDKWork index, reporting transport and protocol failures as degradation. */
  private async queryRemote(text: string): Promise<RemoteQuery> {
    try {
      const service = createSdkworkSearchService({
        appClient: { search: { queries: { create: body => this.createQuery(body) } } },
      })
      return { response: await service.query({ q: text, pageSize: PAGE_SIZE }) }
    } catch {
      return { failed: true }
    }
  }

  /**
   * Send one query through the generated app client and normalize the wire payload.
   * @param body - the query request the SDKWork service assembled.
   * @returns the typed query response.
   */
  private async createQuery(body: SdkworkSearchAppQueryBody): Promise<SdkworkSearchQueryResponse> {
    const client = this.readClient()
    const payload = await client.search.queries.create({
      q: body.q,
      ...(body.page === undefined ? {} : { page: body.page }),
      ...(body.pageSize === undefined ? {} : { pageSize: body.pageSize }),
      ...(body.capabilityIds === undefined ? {} : { capabilityIds: [...body.capabilityIds] }),
      ...(body.groupIds === undefined ? {} : { groupIds: [...body.groupIds] }),
      ...(body.scopeIds === undefined ? {} : { scopeIds: [...body.scopeIds] }),
    })
    return normalizeQueryResponse(payload)
  }

  /** Build or reuse the generated app client for the active gateway. */
  private readClient(): ReturnType<typeof createSearchAppClient> {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-sdkwork-search: SDKWork base URL is not configured')
    const session = this.options.iam.controller.getState().session
    syncSdkworkGlobalTokenManager(session, this.options.env.accessToken())
    if (this.client === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.client = createSearchAppClient({
        authMode: 'dual-token',
        baseUrl,
        tokenManager: getSdkworkGlobalTokenManager(),
      })
    }
    return this.client
  }
}

/**
 * Configure the SDKWork Search runtime for this plugin instance.
 * @param options - environment, IAM, and catalog sources.
 * @returns the runtime the page queries through.
 */
export function createSearchRuntime(options: SearchRuntimeOptions): SearchRuntime {
  return new SearchRuntimeImpl(options)
}

/**
 * Run the local catalog query through the SDKWork Search service facade.
 * @param catalog - the resolved local catalog.
 * @param query - the trimmed user query.
 * @returns ranked hits in catalog order.
 */
async function queryLocal(catalog: SearchCatalog, query: string): Promise<readonly SdkworkSearchResult[]> {
  const service = createSdkworkSearchService({ localDocuments: catalog.documents })
  const response = await service.query({ q: query, pageSize: PAGE_SIZE })
  return response.items
}

/** One section while its hits are still being collected. */
interface PendingSection {
  heading: string
  order: number
  results: SearchResultItem[]
}

/**
 * Group one source's hits into rendered sections, resolving navigation targets.
 * @param origin - which source produced the hits.
 * @param results - ranked hits from that source.
 * @param catalog - the local catalog, whose destination maps resolve hits.
 * @returns rendered sections in the source's group then rank order.
 */
function toGroups(
  origin: SearchResultOrigin,
  results: readonly SdkworkSearchResult[],
  catalog: SearchCatalog,
): readonly SearchResultGroup[] {
  const sections = new Map<string, PendingSection>()
  for (const result of results) {
    const destination = destinationOf(origin, result.document, catalog)
    const item: SearchResultItem = {
      id: result.document.id,
      title: result.document.title,
      ...(result.document.description === undefined ? {} : { description: result.document.description }),
      origin,
      ...(destination === undefined ? {} : { destination }),
    }
    const heading = result.document.group ?? ''
    const existing = sections.get(heading)
    if (existing === undefined) {
      sections.set(heading, {
        heading,
        order: result.document.groupOrder ?? Number.MAX_SAFE_INTEGER,
        results: [item],
      })
      continue
    }
    existing.results.push(item)
  }
  return [...sections.values()]
    .sort((left, right) => left.order - right.order || left.heading.localeCompare(right.heading))
    .map((section, index) => ({
      id: `${origin}:${index}`,
      heading: section.heading,
      results: section.results,
    }))
}

/**
 * Resolve the navigation target one hit carries.
 * @param origin - which source produced the hit.
 * @param document - the hit's document.
 * @param catalog - the local catalog.
 * @returns the destination, or undefined for a hit that names no live surface.
 */
function destinationOf(
  origin: SearchResultOrigin,
  document: SdkworkSearchDocument,
  catalog: SearchCatalog,
): SearchDestination | undefined {
  if (origin === 'local') return catalog.destinations.get(document.id)
  const mode = document.metadata?.mode
  return typeof mode === 'string' ? catalog.destinationForMode(mode) : undefined
}

/**
 * @param value - a decoded wire value.
 * @returns whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param value - a decoded wire value.
 * @param fallback - the value to use when the field is missing or not positive.
 * @returns the truncated positive integer, or the fallback.
 */
function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
}

/**
 * Normalize the untrusted SDKWork query payload into the typed response contract.
 * @param payload - the generated client's decoded body.
 * @returns the typed response; malformed rows are dropped, never trusted.
 * @throws {Error} when the payload carries no response object at all.
 */
function normalizeQueryResponse(payload: unknown): SdkworkSearchQueryResponse {
  if (!isRecord(payload)) throw new Error('ui-sdkwork-search: SDKWork query response is not an object')
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const items: SdkworkSearchResult[] = []
  for (const rawItem of rawItems) {
    const item = normalizeResult(rawItem)
    if (item !== undefined) items.push(item)
  }
  const rawPage = isRecord(payload.pageInfo) ? payload.pageInfo : {}
  return {
    items,
    pageInfo: {
      page: readPositiveInteger(rawPage.page, 1),
      pageSize: readPositiveInteger(rawPage.pageSize, PAGE_SIZE),
      totalItems: readPositiveInteger(rawPage.totalItems, items.length),
      totalPages: readPositiveInteger(rawPage.totalPages, 1),
    },
    q: typeof payload.q === 'string' ? payload.q : '',
    requestId: typeof payload.requestId === 'string' ? payload.requestId : '',
  }
}

/**
 * @param raw - one decoded wire item.
 * @returns the validated result row, or undefined when the wire value is malformed.
 */
function normalizeResult(raw: unknown): SdkworkSearchResult | undefined {
  if (!isRecord(raw)) return undefined
  const document = normalizeDocument(raw.document)
  if (document === undefined) return undefined
  const matchedOn = raw.matchedOn
  if (matchedOn !== 'title' && matchedOn !== 'keyword' && matchedOn !== 'description'
    && matchedOn !== 'group' && matchedOn !== 'scope') {
    return undefined
  }
  return {
    document,
    matchedOn,
    score: typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : 0,
  }
}

/**
 * @param raw - one decoded wire document.
 * @returns the validated document, or undefined when it carries no id or title.
 */
function normalizeDocument(raw: unknown): SdkworkSearchDocument | undefined {
  if (!isRecord(raw)) return undefined
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (id === '' || title === '') return undefined
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
    : undefined
  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined
  return {
    id,
    title,
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(typeof raw.group === 'string' ? { group: raw.group } : {}),
    ...(typeof raw.groupOrder === 'number' ? { groupOrder: raw.groupOrder } : {}),
    ...(typeof raw.order === 'number' ? { order: raw.order } : {}),
    ...(keywords === undefined ? {} : { keywords }),
    ...(typeof raw.scope === 'string' ? { scope: raw.scope } : {}),
    ...(typeof raw.source === 'string' ? { source: raw.source } : {}),
    ...(typeof raw.capability === 'string' ? { capability: raw.capability } : {}),
    ...(typeof raw.kind === 'string' ? { kind: raw.kind } : {}),
    ...(metadata === undefined ? {} : { metadata }),
  }
}
