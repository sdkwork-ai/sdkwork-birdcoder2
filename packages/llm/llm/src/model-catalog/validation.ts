/**
 * Runtime validation for catalog documents.
 *
 * A server document is untrusted input: it may be truncated, replayed, served
 * by an older contract, or produced by a bug. Parsing here is deliberately
 * independent of TypeScript's compile-time types, and it keeps unknown fields
 * so a client older than the server can carry forward data it does not read.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog/validation
 */

import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import {
  SUPPORTED_CATALOG_SCHEMA_MAJOR,
  type ModelCatalogDelta,
  type ModelCatalogErrorCode,
  type ModelCatalogModel,
  type ModelCatalogSnapshot,
  type ModelCatalogTombstone,
  type ModelCatalogVendor,
  type ModelParameterConstraint,
  type ModelParameterDescriptor,
  type ModelParameterValue,
} from './types.ts'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
const CATALOG_VERSION = /^\d{4}\.\d{2}\.\d{2}\.\d+$/
const PARAMETER_NAME = /^[a-z][a-z0-9_]*$/
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

/** A catalog document that violates the wire contract. */
export class ModelCatalogContractError extends Error {
  /** Stable failure code. */
  readonly code: ModelCatalogErrorCode
  /** Every issue found while parsing. */
  readonly issues: readonly string[]

  constructor(code: ModelCatalogErrorCode, message: string, issues: readonly string[] = []) {
    super(message)
    this.name = 'ModelCatalogContractError'
    this.code = code
    this.issues = issues
  }
}

type Record_ = Record<string, unknown>

function isRecord(value: unknown): value is Record_ {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Collects every issue so one failure report names all of them. */
class Issues {
  readonly items: string[] = []

  report(condition: boolean, path: string, message: string): void {
    if (!condition) this.items.push(`${path || '$'}: ${message}`)
  }
}

function requireRecord(value: unknown, path: string, issues: Issues): Record_ {
  if (!isRecord(value)) {
    issues.report(false, path, 'must be an object')
    return {}
  }
  return value
}

function requireString(value: unknown, path: string, issues: Issues, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length === 0) {
    issues.report(false, path, 'must be a non-empty string')
    return ''
  }
  if (pattern !== undefined && !pattern.test(value)) {
    issues.report(false, path, `must match ${String(pattern)}`)
  }
  return value
}

function optionalString(value: unknown, path: string, issues: Issues): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    issues.report(false, path, 'must be a string')
    return undefined
  }
  return value
}

function requireBoolean(value: unknown, path: string, issues: Issues): boolean {
  if (typeof value !== 'boolean') {
    issues.report(false, path, 'must be a boolean')
    return false
  }
  return value
}

function requireInteger(value: unknown, path: string, issues: Issues, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    issues.report(false, path, `must be an integer >= ${minimum}`)
    return minimum
  }
  return value
}

function requireTimestamp(value: unknown, path: string, issues: Issues): string {
  const text = requireString(value, path, issues)
  if (text.length > 0 && !RFC3339.test(text)) issues.report(false, path, 'must be an RFC 3339 timestamp')
  return text
}

function requireStringArray(value: unknown, path: string, issues: Issues): readonly string[] {
  if (!Array.isArray(value)) {
    issues.report(false, path, 'must be an array of strings')
    return []
  }
  return value.flatMap((item, index) => {
    if (typeof item !== 'string' || item.length === 0) {
      issues.report(false, `${path}/${index}`, 'must be a non-empty string')
      return []
    }
    return [item]
  })
}

function parseParameterValue(value: unknown, path: string, issues: Issues): ModelParameterValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item, index) => parseParameterValue(item, `${path}/${index}`, issues))
  if (isRecord(value)) {
    const parsed: Record<string, ModelParameterValue> = {}
    for (const [key, item] of Object.entries(value)) parsed[key] = parseParameterValue(item, `${path}/${key}`, issues)
    return parsed
  }
  issues.report(false, path, 'must be a JSON value')
  return null
}

function optionalFiniteNumber(value: unknown, path: string, issues: Issues): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.report(false, path, 'must be a finite number')
    return undefined
  }
  return value
}

function parseParameterConstraint(value: unknown, path: string, issues: Issues): ModelParameterConstraint {
  const record = requireRecord(value, path, issues)
  const name = requireString(record.name, `${path}/name`, issues)
  const minimum = optionalFiniteNumber(record.minimum, `${path}/minimum`, issues)
  const maximum = optionalFiniteNumber(record.maximum, `${path}/maximum`, issues)
  const enumValues = record.enum === undefined
    ? undefined
    : Array.isArray(record.enum)
      ? record.enum.map((item, index) => parseParameterValue(item, `${path}/enum/${index}`, issues))
      : (issues.report(false, `${path}/enum`, 'must be an array'), undefined)
  const defaultValue = record.default === undefined ? undefined : parseParameterValue(record.default, `${path}/default`, issues)
  return {
    name,
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(enumValues === undefined ? {} : { enum: enumValues }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  }
}

function parseParameterDescriptor(value: unknown, path: string, issues: Issues): ModelParameterDescriptor {
  const record = requireRecord(value, path, issues)
  const name = requireString(record.name, `${path}/name`, issues, PARAMETER_NAME)
  const type = requireString(record.type, `${path}/type`, issues)
  const allowedTypes = ['string', 'number', 'integer', 'boolean', 'enum', 'array', 'object']
  if (type.length > 0 && !allowedTypes.includes(type)) issues.report(false, `${path}/type`, `must be one of ${allowedTypes.join(', ')}`)
  if (type === 'enum' && !Array.isArray(record.enum)) issues.report(false, `${path}/enum`, 'is required for an enum parameter')
  const enumValues = Array.isArray(record.enum)
    ? record.enum.map((item, index) => parseParameterValue(item, `${path}/enum/${index}`, issues))
    : undefined
  const wireName = optionalString(record.wireName, `${path}/wireName`, issues)
  const status = optionalString(record.status, `${path}/status`, issues)
  if (status !== undefined && !['active', 'deprecated', 'experimental'].includes(status)) {
    issues.report(false, `${path}/status`, 'must be active, deprecated, or experimental')
  }
  const scope = optionalString(record.scope, `${path}/scope`, issues)
  if (scope !== undefined && !['request', 'route'].includes(scope)) {
    issues.report(false, `${path}/scope`, 'must be request or route')
  }
  const required = record.required === undefined ? undefined : requireBoolean(record.required, `${path}/required`, issues)
  const description = optionalString(record.description, `${path}/description`, issues)
  const replacement = optionalString(record.replacement, `${path}/replacement`, issues)
  const protocols = record.protocols === undefined
    ? undefined
    : requireStringArray(record.protocols, `${path}/protocols`, issues)
  const minimum = optionalFiniteNumber(record.minimum, `${path}/minimum`, issues)
  const maximum = optionalFiniteNumber(record.maximum, `${path}/maximum`, issues)
  const multipleOf = optionalFiniteNumber(record.multipleOf, `${path}/multipleOf`, issues)
  const minLength = record.minLength === undefined ? undefined : requireInteger(record.minLength, `${path}/minLength`, issues)
  const maxLength = record.maxLength === undefined ? undefined : requireInteger(record.maxLength, `${path}/maxLength`, issues)
  const defaultValue = record.default === undefined ? undefined : parseParameterValue(record.default, `${path}/default`, issues)
  return {
    name,
    type: type as ModelParameterDescriptor['type'],
    ...(wireName === undefined ? {} : { wireName }),
    ...(enumValues === undefined ? {} : { enum: enumValues }),
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
    ...(multipleOf === undefined ? {} : { multipleOf }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(required === undefined ? {} : { required }),
    ...(scope === undefined ? {} : { scope: scope as NonNullable<ModelParameterDescriptor['scope']> }),
    ...(protocols === undefined ? {} : { protocols }),
    ...(status === undefined ? {} : { status: status as NonNullable<ModelParameterDescriptor['status']> }),
    ...(replacement === undefined ? {} : { replacement }),
    ...(description === undefined ? {} : { description }),
    ...(record.extensions === undefined ? {} : { extensions: parseExtensions(record.extensions, `${path}/extensions`, issues) }),
  }
}

function parseExtensions(value: unknown, path: string, issues: Issues): NonNullable<ModelCatalogVendor['extensions']> {
  const record = requireRecord(value, path, issues)
  return record as NonNullable<ModelCatalogVendor['extensions']>
}

function parseVendor(value: unknown, path: string, issues: Issues): ModelCatalogVendor {
  const record = requireRecord(value, path, issues)
  const homepageUrl = record.homepageUrl === null ? null : optionalString(record.homepageUrl, `${path}/homepageUrl`, issues)
  const logoUrl = record.logoUrl === null ? null : optionalString(record.logoUrl, `${path}/logoUrl`, issues)
  return {
    vendorCode: requireString(record.vendorCode, `${path}/vendorCode`, issues),
    regionCode: requireString(record.regionCode, `${path}/regionCode`, issues),
    displayName: requireString(record.displayName, `${path}/displayName`, issues),
    modelCount: requireInteger(record.modelCount, `${path}/modelCount`, issues),
    capabilities: requireStringArray(record.capabilities, `${path}/capabilities`, issues),
    ...(homepageUrl === undefined ? {} : { homepageUrl }),
    ...(logoUrl === undefined ? {} : { logoUrl }),
    ...(record.extensions === undefined ? {} : { extensions: parseExtensions(record.extensions, `${path}/extensions`, issues) }),
  }
}

function parseModel(value: unknown, path: string, issues: Issues): ModelCatalogModel {
  const record = requireRecord(value, path, issues)
  const catalogKey = requireString(record.catalogKey, `${path}/catalogKey`, issues)
  if (catalogKey.length > 0 && !catalogKey.includes('/')) issues.report(false, `${path}/catalogKey`, 'must be <vendorCode>/<modelId>')
  const contextTokens = record.contextTokens === null || record.contextTokens === undefined
    ? record.contextTokens as null | undefined
    : requireInteger(record.contextTokens, `${path}/contextTokens`, issues, 1)
  const maxOutputTokens = record.maxOutputTokens === null || record.maxOutputTokens === undefined
    ? record.maxOutputTokens as null | undefined
    : requireInteger(record.maxOutputTokens, `${path}/maxOutputTokens`, issues, 1)
  const defaultParameters = record.defaultParameters === undefined
    ? undefined
    : parseParameterDefaults(record.defaultParameters, `${path}/defaultParameters`, issues)
  const parameterConstraints = record.parameterConstraints === undefined
    ? undefined
    : Array.isArray(record.parameterConstraints)
      ? record.parameterConstraints.map((item, index) => parseParameterConstraint(item, `${path}/parameterConstraints/${index}`, issues))
      : (issues.report(false, `${path}/parameterConstraints`, 'must be an array'), undefined)
  const pricing = record.pricing === undefined
    ? undefined
    : Array.isArray(record.pricing)
      ? record.pricing.map((item, index) => {
        const price = requireRecord(item, `${path}/pricing/${index}`, issues)
        return {
          billingMeter: requireString(price.billingMeter, `${path}/pricing/${index}/billingMeter`, issues),
          regionCode: requireString(price.regionCode, `${path}/pricing/${index}/regionCode`, issues),
          unitPrice: requireString(price.unitPrice, `${path}/pricing/${index}/unitPrice`, issues),
          currency: requireString(price.currency, `${path}/pricing/${index}/currency`, issues),
        }
      })
      : (issues.report(false, `${path}/pricing`, 'must be an array'), undefined)
  const parameters = requireStringArray(record.parameters, `${path}/parameters`, issues)
  for (const name of parameters) {
    if (!PARAMETER_NAME.test(name)) issues.report(false, `${path}/parameters`, `"${name}" must match ${String(PARAMETER_NAME)}`)
  }
  return {
    catalogKey,
    modelId: requireString(record.modelId, `${path}/modelId`, issues),
    vendorCode: requireString(record.vendorCode, `${path}/vendorCode`, issues),
    vendorName: requireString(record.vendorName, `${path}/vendorName`, issues),
    regionCode: requireString(record.regionCode, `${path}/regionCode`, issues),
    displayName: requireString(record.displayName, `${path}/displayName`, issues),
    capabilities: requireStringArray(record.capabilities, `${path}/capabilities`, issues),
    inputModalities: requireStringArray(record.inputModalities, `${path}/inputModalities`, issues),
    outputModalities: requireStringArray(record.outputModalities, `${path}/outputModalities`, issues),
    apiFormat: requireString(record.apiFormat, `${path}/apiFormat`, issues),
    ...(contextTokens === undefined ? {} : { contextTokens }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    supportsStreaming: requireBoolean(record.supportsStreaming, `${path}/supportsStreaming`, issues),
    supportsTools: requireBoolean(record.supportsTools, `${path}/supportsTools`, issues),
    supportsJsonSchema: requireBoolean(record.supportsJsonSchema, `${path}/supportsJsonSchema`, issues),
    lifecycle: requireString(record.lifecycle, `${path}/lifecycle`, issues),
    releaseStage: requireString(record.releaseStage, `${path}/releaseStage`, issues),
    shelfState: requireString(record.shelfState, `${path}/shelfState`, issues),
    routingState: requireString(record.routingState, `${path}/routingState`, issues),
    parameters,
    ...(defaultParameters === undefined ? {} : { defaultParameters }),
    ...(parameterConstraints === undefined ? {} : { parameterConstraints }),
    ...(pricing === undefined ? {} : { pricing }),
    ...(record.extensions === undefined ? {} : { extensions: parseExtensions(record.extensions, `${path}/extensions`, issues) }),
  }
}

function parseParameterDefaults(value: unknown, path: string, issues: Issues): { readonly [name: string]: ModelParameterValue } {
  const record = requireRecord(value, path, issues)
  const parsed: Record<string, ModelParameterValue> = {}
  for (const [name, item] of Object.entries(record)) parsed[name] = parseParameterValue(item, `${path}/${name}`, issues)
  return parsed
}

function parsePageInfo(value: unknown, path: string, issues: Issues): ModelCatalogSnapshot['pageInfo'] {
  const record = requireRecord(value, path, issues)
  const mode = requireString(record.mode, `${path}/mode`, issues)
  if (mode.length > 0 && mode !== 'offset' && mode !== 'cursor') issues.report(false, `${path}/mode`, 'must be offset or cursor')
  const page = record.page === undefined ? undefined : requireInteger(record.page, `${path}/page`, issues, 1)
  const pageSize = record.pageSize === undefined ? undefined : requireInteger(record.pageSize, `${path}/pageSize`, issues, 1)
  const totalItems = record.totalItems === undefined ? undefined : requireInteger(record.totalItems, `${path}/totalItems`, issues)
  const nextCursor = record.nextCursor === undefined || record.nextCursor === null
    ? record.nextCursor as string | null | undefined
    : requireString(record.nextCursor, `${path}/nextCursor`, issues)
  return {
    mode: mode as ModelCatalogSnapshot['pageInfo']['mode'],
    hasMore: requireBoolean(record.hasMore, `${path}/hasMore`, issues),
    ...(page === undefined ? {} : { page }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(nextCursor === undefined ? {} : { nextCursor }),
    ...(totalItems === undefined ? {} : { totalItems }),
  }
}

/** Validate the optional resolved presentation policy. */
function parsePresentation(value: unknown, path: string, issues: Issues): void {
  const record = requireRecord(value, path, issues)
  for (const field of [
    'openApiEnabled',
    'appApiEnabled',
    'includeParameters',
    'includePricing',
    'includeExtensions',
    'exposeDeprecatedModels',
  ]) {
    if (record[field] !== undefined) requireBoolean(record[field], `${path}/${field}`, issues)
  }
  for (const field of ['defaultPageSize', 'maxPageSize']) {
    if (record[field] !== undefined) requireInteger(record[field], `${path}/${field}`, issues, 1)
  }
  if (record.vendorOrder !== undefined) requireStringArray(record.vendorOrder, `${path}/vendorOrder`, issues)
}

/** The major component of a contract version, or `undefined` when malformed. */
export function catalogSchemaMajor(version: string): number | undefined {
  const match = SEMVER.exec(version)
  return match === null ? undefined : Number(match[1])
}

/** Whether this client implements the given contract version's major. */
export function isCatalogSchemaSupported(version: string): boolean {
  const major = catalogSchemaMajor(version)
  return major !== undefined && major >= 1 && major <= SUPPORTED_CATALOG_SCHEMA_MAJOR
}

function checkSchemaVersion(value: unknown, issues: Issues): string {
  const version = requireString(value, '/schemaVersion', issues, SEMVER)
  if (version.length > 0 && !isCatalogSchemaSupported(version)) {
    throw new ModelCatalogContractError(
      'model_catalog.version_unsupported',
      `model catalog schema ${version} is not supported (this client implements major ${SUPPORTED_CATALOG_SCHEMA_MAJOR})`,
      [...issues.items],
    )
  }
  return version
}

function assertUnique(keys: readonly string[], path: string, issues: Issues): void {
  const seen = new Set<string>()
  for (const key of keys) {
    if (seen.has(key)) issues.report(false, path, `duplicate key "${key}"`)
    seen.add(key)
  }
}

function validateSnapshotArrays(snapshot: {
  vendors: readonly ModelCatalogVendor[]
  models: readonly ModelCatalogModel[]
  parameters: readonly ModelParameterDescriptor[]
}, issues: Issues): void {
  assertUnique(snapshot.vendors.map(vendor => `${vendor.vendorCode}\u0000${vendor.regionCode}`), '/vendors', issues)
  assertUnique(snapshot.models.map(model => model.catalogKey), '/models', issues)
  assertUnique(snapshot.parameters.map(parameter => parameter.name), '/parameters', issues)
  if (snapshot.parameters.length === 0) return
  const known = new Set(snapshot.parameters.map(parameter => parameter.name))
  for (const model of snapshot.models) {
    for (const name of model.parameters) {
      if (!known.has(name)) issues.report(false, `/models/${model.catalogKey}/parameters`, `"${name}" is absent from the parameter registry`)
    }
    for (const name of Object.keys(model.defaultParameters ?? {})) {
      if (!known.has(name)) issues.report(false, `/models/${model.catalogKey}/defaultParameters`, `"${name}" is absent from the parameter registry`)
    }
    for (const constraint of model.parameterConstraints ?? []) {
      if (!known.has(constraint.name)) issues.report(false, `/models/${model.catalogKey}/parameterConstraints`, `"${constraint.name}" is absent from the parameter registry`)
    }
  }
}

/** Parse one snapshot page. Unknown fields survive; known fields are validated. */
export function parseModelCatalogSnapshot(value: unknown): ModelCatalogSnapshot {
  const issues = new Issues()
  const record = requireRecord(value, '$', issues)
  issues.report(record.object === 'model_catalog', '/object', 'must be "model_catalog"')
  checkSchemaVersion(record.schemaVersion, issues)
  requireString(record.catalogVersion, '/catalogVersion', issues, CATALOG_VERSION)
  requireInteger(record.revision, '/revision', issues, 1)
  requireString(record.parameterRegistryVersion, '/parameterRegistryVersion', issues, SEMVER)
  requireTimestamp(record.generatedAt, '/generatedAt', issues)
  requireTimestamp(record.updatedAt, '/updatedAt', issues)
  parsePageInfo(record.pageInfo, '/pageInfo', issues)
  if (record.presentation !== undefined) parsePresentation(record.presentation, '/presentation', issues)
  const vendors = parseArray(record.vendors, '/vendors', issues, parseVendor)
  const models = parseArray(record.models, '/models', issues, parseModel)
  const parameters = parseArray(record.parameters, '/parameters', issues, parseParameterDescriptor)
  validateSnapshotArrays({ vendors, models, parameters }, issues)
  if (issues.items.length > 0) {
    throw new ModelCatalogContractError('model_catalog.invalid_document', 'model catalog snapshot violates the wire contract', issues.items)
  }
  return deepFreeze(value as ModelCatalogSnapshot)
}

function parseArray<T>(
  value: unknown,
  path: string,
  issues: Issues,
  parse: (item: unknown, itemPath: string, issues: Issues) => T,
): readonly T[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    issues.report(false, path, 'must be an array')
    return []
  }
  return value.map((item, index) => parse(item, `${path}/${index}`, issues))
}

function parseTombstone(value: unknown, path: string, issues: Issues): ModelCatalogTombstone {
  const record = requireRecord(value, path, issues)
  return {
    catalogKey: requireString(record.catalogKey, `${path}/catalogKey`, issues),
    revision: requireInteger(record.revision, `${path}/revision`, issues, 1),
    removedAt: requireTimestamp(record.removedAt, `${path}/removedAt`, issues),
  }
}

/** Parse one delta. When `currentRevision` is supplied, a base mismatch fails with `revision_gap`. */
export function parseModelCatalogDelta(
  value: unknown,
  options: { readonly currentRevision?: number } = {},
): ModelCatalogDelta {
  const issues = new Issues()
  const record = requireRecord(value, '$', issues)
  issues.report(record.object === 'model_catalog.changes', '/object', 'must be "model_catalog.changes"')
  checkSchemaVersion(record.schemaVersion, issues)
  requireString(record.catalogVersion, '/catalogVersion', issues, CATALOG_VERSION)
  const baseRevision = requireInteger(record.baseRevision, '/baseRevision', issues, 1)
  const revision = requireInteger(record.revision, '/revision', issues, 1)
  if (revision <= baseRevision) issues.report(false, '/revision', 'must be greater than baseRevision')
  requireTimestamp(record.updatedAt, '/updatedAt', issues)
  if (record.parameterRegistryVersion !== undefined) {
    requireString(record.parameterRegistryVersion, '/parameterRegistryVersion', issues, SEMVER)
  }
  parseArray(record.vendors, '/vendors', issues, parseVendor)
  const models = parseArray(record.models, '/models', issues, parseModel)
  parseArray(record.parameters, '/parameters', issues, parseParameterDescriptor)
  parseArray(record.tombstones, '/tombstones', issues, parseTombstone)
  requireBoolean(record.hasMore, '/hasMore', issues)
  if (record.nextSinceRevision !== undefined) {
    requireInteger(record.nextSinceRevision, '/nextSinceRevision', issues, 1)
  }
  assertUnique(models.map(model => model.catalogKey), '/models', issues)
  if (issues.items.length > 0) {
    throw new ModelCatalogContractError('model_catalog.invalid_document', 'model catalog delta violates the wire contract', issues.items)
  }
  if (options.currentRevision !== undefined && baseRevision !== options.currentRevision) {
    throw new ModelCatalogContractError(
      'model_catalog.revision_gap',
      `model catalog delta starts at revision ${baseRevision}, but this client holds ${options.currentRevision}`,
    )
  }
  return deepFreeze(value as ModelCatalogDelta)
}
