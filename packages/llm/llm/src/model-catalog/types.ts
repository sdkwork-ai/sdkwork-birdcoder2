/**
 * Wire types for the versioned model-catalog exchange defined by
 * `TECH-2026-11-15-model-catalog-sync-api.md` in `sdkwork-cloudrouter`.
 *
 * These types describe the document both the open-api and app-api surfaces
 * serve. They are read-only on purpose: a published catalog is an immutable
 * value, and every update replaces the value instead of editing it.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog/types
 */

/** Contract version this module implements. */
export const MODEL_CATALOG_SCHEMA_VERSION = '1.0.0'

/** Schema major this module accepts from a server. */
export const SUPPORTED_CATALOG_SCHEMA_MAJOR = 1

/** Parameter value domain. */
export type ModelParameterType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'object'

/** Parameter lifecycle, mirroring the catalog release lifecycle. */
export type ModelParameterStatus = 'active' | 'deprecated' | 'experimental'

/** Parameter applicability: one request, or the whole route. */
export type ModelParameterScope = 'request' | 'route'

/** A value a descriptor may carry (default, enum member). */
export type ModelParameterValue =
  | string
  | number
  | boolean
  | null
  | readonly ModelParameterValue[]
  | { readonly [key: string]: ModelParameterValue }

/** Namespaced extension data. Keys use `<namespace>.<name>`. */
export interface CatalogExtensions {
  readonly [key: string]: unknown
}

/** One request parameter a model accepts. */
export interface ModelParameterDescriptor {
  /** Stable client-side name, `[a-z][a-z0-9_]*`. */
  readonly name: string
  /** Provider wire field; defaults to `name`. */
  readonly wireName?: string
  /** Value domain. */
  readonly type: ModelParameterType
  /** Allowed values when `type` is `enum`. */
  readonly enum?: readonly ModelParameterValue[]
  /** Numeric floor. */
  readonly minimum?: number
  /** Numeric ceiling. */
  readonly maximum?: number
  /** Numeric granularity. */
  readonly multipleOf?: number
  /** String floor. */
  readonly minLength?: number
  /** String ceiling. */
  readonly maxLength?: number
  /** Descriptor-level default. */
  readonly default?: ModelParameterValue
  /** Whether the wire field is mandatory. */
  readonly required?: boolean
  /** Per request, or per route. */
  readonly scope?: ModelParameterScope
  /** Wire protocols that accept it; omitted means every protocol. */
  readonly protocols?: readonly string[]
  /** Lifecycle. */
  readonly status?: ModelParameterStatus
  /** Parameter that replaces a deprecated one. */
  readonly replacement?: string
  /** Human-readable description. */
  readonly description?: string
  /** Namespaced extension data. */
  readonly extensions?: CatalogExtensions
}

/** A per-model narrowing of one parameter descriptor. */
export interface ModelParameterConstraint {
  /** Descriptor name this constraint narrows. */
  readonly name: string
  /** Per-model numeric floor. */
  readonly minimum?: number
  /** Per-model numeric ceiling. */
  readonly maximum?: number
  /** Per-model allowed values. */
  readonly enum?: readonly ModelParameterValue[]
  /** Per-model default. */
  readonly default?: ModelParameterValue
}

/** One vendor offered in one region. */
export interface ModelCatalogVendor {
  /** Vendor code, the first segment of a catalog key. */
  readonly vendorCode: string
  /** Region code, `global` when the catalog is not regional. */
  readonly regionCode: string
  /** Display name. */
  readonly displayName: string
  /** Number of models this revision exposes for the vendor. */
  readonly modelCount: number
  /** Capability codes the vendor offers. */
  readonly capabilities: readonly string[]
  /** Vendor homepage, when the catalog states one. */
  readonly homepageUrl?: string | null
  /** Vendor logo, when the catalog states one. */
  readonly logoUrl?: string | null
  /** Namespaced extension data. */
  readonly extensions?: CatalogExtensions
}

/** One reference price row for a model. */
export interface ModelCatalogPrice {
  /** Billing meter code. */
  readonly billingMeter: string
  /** Region code. */
  readonly regionCode: string
  /** Decimal price as text, never a float. */
  readonly unitPrice: string
  /** ISO 4217 currency code. */
  readonly currency: string
}

/** One model row of a catalog revision. */
export interface ModelCatalogModel {
  /** Stable identity, `<vendorCode>/<modelId>`. The only key a client persists. */
  readonly catalogKey: string
  /** Vendor-local model id. */
  readonly modelId: string
  /** Vendor code. */
  readonly vendorCode: string
  /** Vendor display name. */
  readonly vendorName: string
  /** Region code. */
  readonly regionCode: string
  /** Display name. */
  readonly displayName: string
  /** Capability codes; open set. */
  readonly capabilities: readonly string[]
  /** Accepted input modalities; open set. */
  readonly inputModalities: readonly string[]
  /** Produced output modalities; open set. */
  readonly outputModalities: readonly string[]
  /** Catalog API format code. */
  readonly apiFormat: string
  /** Context window in tokens. */
  readonly contextTokens?: number | null
  /** Maximum output tokens. */
  readonly maxOutputTokens?: number | null
  /** Whether the model streams. */
  readonly supportsStreaming: boolean
  /** Whether the model accepts tool definitions. */
  readonly supportsTools: boolean
  /** Whether the model accepts a JSON schema response format. */
  readonly supportsJsonSchema: boolean
  /** Lifecycle code. */
  readonly lifecycle: string
  /** Release stage code. */
  readonly releaseStage: string
  /** Shelf state code. */
  readonly shelfState: string
  /** Routing state code. */
  readonly routingState: string
  /** Parameter names this model accepts, resolved against the registry. */
  readonly parameters: readonly string[]
  /** Parameter defaults for this model, keyed by parameter name. */
  readonly defaultParameters?: { readonly [name: string]: ModelParameterValue }
  /** Per-model parameter constraints. */
  readonly parameterConstraints?: readonly ModelParameterConstraint[]
  /** Reference prices; present when `include=pricing`. */
  readonly pricing?: readonly ModelCatalogPrice[]
  /** Namespaced extension data. */
  readonly extensions?: CatalogExtensions
}

/** Pagination state of one snapshot page. */
export interface ModelCatalogPageInfo {
  /** Pagination mode. */
  readonly mode: 'offset' | 'cursor'
  /** One-based page number. */
  readonly page?: number
  /** Page size. */
  readonly pageSize?: number
  /** Opaque cursor for the next page. */
  readonly nextCursor?: string | null
  /** Whether another page exists. */
  readonly hasMore: boolean
  /** Total rows, when the server states one. */
  readonly totalItems?: number
}

/** Resolved presentation policy for a served catalog. */
export interface ModelCatalogPresentation {
  /** Whether the open-api surface is served. */
  readonly openApiEnabled: boolean
  /** Whether the app-api surface is served. */
  readonly appApiEnabled: boolean
  /** Whether a snapshot includes the parameter registry by default. */
  readonly includeParameters: boolean
  /** Whether a snapshot includes reference prices by default. */
  readonly includePricing: boolean
  /** Whether a snapshot includes extension data by default. */
  readonly includeExtensions: boolean
  /** Whether deprecated and retired models stay in the catalog. */
  readonly exposeDeprecatedModels: boolean
  /** Snapshot page size when the caller omits `page_size`. */
  readonly defaultPageSize: number
  /** Largest accepted page size. */
  readonly maxPageSize: number
  /** Vendor codes in presentation order. */
  readonly vendorOrder: readonly string[]
}

/** One page of one catalog revision. */
export interface ModelCatalogSnapshot {
  /** Discriminator. */
  readonly object: 'model_catalog'
  /** Contract version. */
  readonly schemaVersion: string
  /** Catalog data release, `YYYY.MM.DD.N`. */
  readonly catalogVersion: string
  /** Monotonic projection revision. */
  readonly revision: number
  /** Parameter registry version. */
  readonly parameterRegistryVersion: string
  /** Catalog release time (RFC 3339). */
  readonly generatedAt: string
  /** Projection time (RFC 3339). */
  readonly updatedAt: string
  /** Pagination state. */
  readonly pageInfo: ModelCatalogPageInfo
  /** Vendors on this page. */
  readonly vendors?: readonly ModelCatalogVendor[]
  /** Models on this page. */
  readonly models?: readonly ModelCatalogModel[]
  /** Parameter descriptors on this page. */
  readonly parameters?: readonly ModelParameterDescriptor[]
  /** Presentation policy resolved for this snapshot. */
  readonly presentation?: ModelCatalogPresentation
  /** Namespaced extension data. */
  readonly extensions?: CatalogExtensions
}

/** A model removed from the catalog at a revision. */
export interface ModelCatalogTombstone {
  /** Removed catalog key. */
  readonly catalogKey: string
  /** Revision that removed it. */
  readonly revision: number
  /** Removal time (RFC 3339). */
  readonly removedAt: string
}

/** Rows changed between two consecutive revisions. */
export interface ModelCatalogDelta {
  /** Discriminator. */
  readonly object: 'model_catalog.changes'
  /** Contract version. */
  readonly schemaVersion: string
  /** Catalog data release. */
  readonly catalogVersion: string
  /** Revision the client already holds. */
  readonly baseRevision: number
  /** Revision produced by applying this delta. */
  readonly revision: number
  /** Projection time (RFC 3339). */
  readonly updatedAt: string
  /** Parameter registry version after the delta. */
  readonly parameterRegistryVersion?: string
  /** Vendor upserts. */
  readonly vendors?: readonly ModelCatalogVendor[]
  /** Model upserts. */
  readonly models?: readonly ModelCatalogModel[]
  /** Parameter descriptor upserts. */
  readonly parameters?: readonly ModelParameterDescriptor[]
  /** Models removed at this revision. */
  readonly tombstones: readonly ModelCatalogTombstone[]
  /** Whether another delta page exists. */
  readonly hasMore: boolean
  /** Revision to request next. */
  readonly nextSinceRevision?: number
}

/** Where a published catalog came from. */
export type ModelCatalogSource = 'seed' | 'backend'

/** One immutable published catalog value. */
export interface ModelCatalogView {
  /** The snapshot readers observe. */
  readonly snapshot: ModelCatalogSnapshot
  /** Provenance. */
  readonly source: ModelCatalogSource
  /** Publication time (RFC 3339). */
  readonly loadedAt: string
}

/** Synchronization state reported to surfaces. */
export type ModelCatalogSyncState = 'idle' | 'syncing' | 'current' | 'degraded' | 'offline'

/** Diagnostics for the last synchronization attempt. */
export interface ModelCatalogSyncStatus {
  /** Current state. */
  readonly state: ModelCatalogSyncState
  /** Published revision, when a catalog is published. */
  readonly revision?: number
  /** Published catalog data release. */
  readonly catalogVersion?: string
  /** Stored validator. */
  readonly etag?: string
  /** Last successful check time (RFC 3339). */
  readonly lastCheckedAt?: string
  /** Last successful update time (RFC 3339). */
  readonly lastSyncedAt?: string
  /** Stable failure code of the last attempt. */
  readonly lastErrorCode?: string
  /** Human-readable failure detail of the last attempt. */
  readonly lastErrorMessage?: string
}

/** Failure codes shared with the server contract. */
export type ModelCatalogErrorCode =
  | 'model_catalog.version_unsupported'
  | 'model_catalog.revision_gap'
  | 'model_catalog.invalid_cursor'
  | 'model_catalog.unauthorized'
  | 'model_catalog.forbidden'
  | 'model_catalog.model_not_found'
  | 'model_catalog.rate_limited'
  | 'model_catalog.unavailable'
  | 'model_catalog.invalid_document'
  | 'model_catalog.stale_revision'
  | 'model_catalog.revision_changed_during_pagination'
