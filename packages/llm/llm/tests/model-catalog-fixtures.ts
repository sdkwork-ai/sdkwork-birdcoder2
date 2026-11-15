/**
 * Fixtures for the model-catalog specs. Not a spec itself.
 */
import type {
  ModelCatalogDelta,
  ModelCatalogModel,
  ModelCatalogSnapshot,
  ModelCatalogVendor,
  ModelParameterDescriptor,
} from '../src/index.ts'

export const STAMP = '2026-11-15T09:30:00Z'

export function makeVendor(vendorCode: string, overrides: Partial<ModelCatalogVendor> = {}): ModelCatalogVendor {
  return {
    vendorCode,
    regionCode: 'global',
    displayName: vendorCode.toUpperCase(),
    modelCount: 1,
    capabilities: ['chat'],
    ...overrides,
  }
}

export function makeModel(catalogKey: string, overrides: Partial<ModelCatalogModel> = {}): ModelCatalogModel {
  const [vendorCode = 'vendor', modelId = 'model'] = catalogKey.split('/')
  return {
    catalogKey,
    modelId,
    vendorCode,
    vendorName: vendorCode.toUpperCase(),
    regionCode: 'global',
    displayName: `${vendorCode} ${modelId}`,
    capabilities: ['chat'],
    inputModalities: ['text'],
    outputModalities: ['text'],
    apiFormat: 'openai_compatible',
    contextTokens: 128_000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsTools: true,
    supportsJsonSchema: true,
    lifecycle: 'active',
    releaseStage: 'active',
    shelfState: 'listed',
    routingState: 'enabled',
    parameters: [],
    ...overrides,
  }
}

export function makeParameter(name: string, overrides: Partial<ModelParameterDescriptor> = {}): ModelParameterDescriptor {
  return {
    name,
    type: 'number',
    minimum: 0,
    maximum: 2,
    default: 1,
    scope: 'request',
    status: 'active',
    ...overrides,
  }
}

export interface SnapshotOptions {
  readonly models?: readonly ModelCatalogModel[]
  readonly vendors?: readonly ModelCatalogVendor[]
  readonly parameters?: readonly ModelParameterDescriptor[]
  readonly catalogVersion?: string
  readonly pageInfo?: ModelCatalogSnapshot['pageInfo']
  readonly extensions?: ModelCatalogSnapshot['extensions']
}

export function makeSnapshot(revision: number, options: SnapshotOptions = {}): ModelCatalogSnapshot {
  const models = options.models ?? []
  return {
    object: 'model_catalog',
    schemaVersion: '1.0.0',
    catalogVersion: options.catalogVersion ?? '2026.11.14.6',
    revision,
    parameterRegistryVersion: '1.0.0',
    generatedAt: STAMP,
    updatedAt: STAMP,
    pageInfo: options.pageInfo ?? {
      mode: 'offset',
      page: 1,
      pageSize: Math.max(1, models.length),
      nextCursor: null,
      hasMore: false,
      totalItems: models.length,
    },
    ...(options.vendors === undefined ? {} : { vendors: options.vendors }),
    ...(models.length === 0 ? {} : { models }),
    ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
    ...(options.extensions === undefined ? {} : { extensions: options.extensions }),
  }
}

export interface DeltaOptions {
  readonly models?: readonly ModelCatalogModel[]
  readonly vendors?: readonly ModelCatalogVendor[]
  readonly parameters?: readonly ModelParameterDescriptor[]
  readonly tombstones?: ModelCatalogDelta['tombstones']
  readonly hasMore?: boolean
  readonly nextSinceRevision?: number
  readonly parameterRegistryVersion?: string
}

export function makeDelta(baseRevision: number, revision: number, options: DeltaOptions = {}): ModelCatalogDelta {
  return {
    object: 'model_catalog.changes',
    schemaVersion: '1.0.0',
    catalogVersion: '2026.11.14.6',
    baseRevision,
    revision,
    updatedAt: STAMP,
    ...(options.vendors === undefined ? {} : { vendors: options.vendors }),
    ...(options.models === undefined ? {} : { models: options.models }),
    ...(options.parameters === undefined ? {} : { parameters: options.parameters }),
    ...(options.parameterRegistryVersion === undefined
      ? {}
      : { parameterRegistryVersion: options.parameterRegistryVersion }),
    tombstones: options.tombstones ?? [],
    hasMore: options.hasMore ?? false,
    ...(options.nextSinceRevision === undefined ? {} : { nextSinceRevision: options.nextSinceRevision }),
  }
}
