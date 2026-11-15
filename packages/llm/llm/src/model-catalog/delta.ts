/**
 * Delta application for the model catalog.
 *
 * A delta is merged into a copy of the current snapshot and the copy is
 * returned; the snapshot the caller passed in is never mutated. Ordering is
 * stable: a replaced row keeps its position, an added row appends in delta
 * order, and a tombstoned row disappears. That keeps a picker's order stable
 * between revisions.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog/delta
 */

import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { ModelCatalogContractError } from './validation.ts'
import type {
  ModelCatalogDelta,
  ModelCatalogSnapshot,
  ModelParameterDescriptor,
  ModelCatalogModel,
  ModelCatalogVendor,
} from './types.ts'

/** The pagination state of a locally complete catalog. */
export function completePageInfo(itemCount: number): ModelCatalogSnapshot['pageInfo'] {
  return {
    mode: 'offset',
    page: 1,
    pageSize: Math.max(1, itemCount),
    nextCursor: null,
    hasMore: false,
    totalItems: itemCount,
  }
}

function upsertStable<T>(
  current: readonly T[] | undefined,
  upserts: readonly T[] | undefined,
  keyOf: (row: T) => string,
): T[] {
  const list = [...(current ?? [])]
  const positions = new Map(list.map((row, index) => [keyOf(row), index]))
  for (const row of upserts ?? []) {
    const key = keyOf(row)
    const position = positions.get(key)
    if (position === undefined) {
      positions.set(key, list.length)
      list.push(row)
    } else {
      list[position] = row
    }
  }
  return list
}

function modelKey(model: ModelCatalogModel): string {
  return model.catalogKey
}

function vendorKey(vendor: ModelCatalogVendor): string {
  return `${vendor.vendorCode}\u0000${vendor.regionCode}`
}

function parameterKey(parameter: ModelParameterDescriptor): string {
  return parameter.name
}

/**
 * Apply one delta to the current snapshot, producing a new immutable snapshot.
 * @param current - the snapshot the client holds.
 * @param delta - a validated delta whose `baseRevision` equals `current.revision`.
 * @returns the snapshot at `delta.revision`.
 * @throws ModelCatalogContractError with `model_catalog.revision_gap` when the
 *   delta does not start at the held revision.
 */
export function applyCatalogDelta(current: ModelCatalogSnapshot, delta: ModelCatalogDelta): ModelCatalogSnapshot {
  if (delta.baseRevision !== current.revision) {
    throw new ModelCatalogContractError(
      'model_catalog.revision_gap',
      `model catalog delta starts at revision ${delta.baseRevision}, but the held revision is ${current.revision}`,
    )
  }
  const removed = new Set(delta.tombstones.map(tombstone => tombstone.catalogKey))
  const mergedModels = upsertStable(current.models, delta.models, modelKey).filter(model => !removed.has(model.catalogKey))
  const mergedVendors = upsertStable(current.vendors, delta.vendors, vendorKey)
  const mergedParameters = upsertStable(current.parameters, delta.parameters, parameterKey)
  const next: ModelCatalogSnapshot = {
    object: 'model_catalog',
    schemaVersion: current.schemaVersion,
    catalogVersion: delta.catalogVersion,
    revision: delta.revision,
    parameterRegistryVersion: delta.parameterRegistryVersion ?? current.parameterRegistryVersion,
    generatedAt: current.generatedAt,
    updatedAt: delta.updatedAt,
    pageInfo: completePageInfo(mergedModels.length),
    ...(mergedVendors.length === 0 ? {} : { vendors: mergedVendors }),
    ...(mergedModels.length === 0 ? {} : { models: mergedModels }),
    ...(mergedParameters.length === 0 ? {} : { parameters: mergedParameters }),
    ...(current.extensions === undefined ? {} : { extensions: current.extensions }),
  }
  return deepFreeze(next)
}

/**
 * The delta's own `nextSinceRevision`, falling back to its `revision` so a
 * pager that omits the field still advances.
 * @param delta - the applied delta.
 * @returns the revision to request next.
 */
export function nextDeltaRevision(delta: ModelCatalogDelta): number {
  return delta.nextSinceRevision ?? delta.revision
}
