/**
 * Source precedence for the effective model catalog.
 *
 * The backend is authoritative whenever it actually has data. A non-empty
 * remote snapshot replaces the bundled seed wholesale; an empty remote snapshot
 * means the deployment has not configured a catalog, so the last known good
 * local snapshot (or the seed) stays in force. Precedence is resolved per
 * catalog, never per field: a field-merged catalog would have no meaningful
 * revision and would hide vendor removals.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog/precedence
 */

import type { ModelCatalogSnapshot, ModelCatalogSource } from './types.ts'

/** Candidate catalogs, strongest provenance first where noted. */
export interface CatalogSourceCandidates {
  /** Build-time projection shipped with the application. */
  readonly seed?: ModelCatalogSnapshot | undefined
  /** Last known good persisted backend snapshot. */
  readonly local?: ModelCatalogSnapshot | undefined
  /** Snapshot fetched from the backend during this process. */
  readonly remote?: ModelCatalogSnapshot | undefined
}

/** The catalog a consumer should render, with its provenance. */
export interface EffectiveCatalog {
  /** The snapshot to use. */
  readonly snapshot: ModelCatalogSnapshot
  /** Where it came from. */
  readonly source: ModelCatalogSource
}

/**
 * Whether a snapshot exposes at least one model. An empty catalog is treated as
 * "not configured" rather than "every model was removed"; removals arrive as
 * tombstones inside a non-empty catalog.
 * @param snapshot - the candidate.
 * @returns whether it has any model rows.
 */
export function isNonEmptyCatalog(snapshot: ModelCatalogSnapshot): boolean {
  return (snapshot.models?.length ?? 0) > 0
}

/**
 * Resolve the effective catalog from the three candidate sources.
 * @param candidates - seed, persisted local, and freshly fetched snapshots.
 * @returns the effective catalog, or `undefined` when no source exists.
 */
export function resolveEffectiveCatalog(candidates: CatalogSourceCandidates): EffectiveCatalog | undefined {
  const remote = candidates.remote
  const local = candidates.local
  const seed = candidates.seed
  if (remote !== undefined && isNonEmptyCatalog(remote)) return { snapshot: remote, source: 'backend' }
  if (local !== undefined && isNonEmptyCatalog(local)) return { snapshot: local, source: 'backend' }
  if (seed !== undefined && isNonEmptyCatalog(seed)) return { snapshot: seed, source: 'seed' }
  if (remote !== undefined) return { snapshot: remote, source: 'backend' }
  if (local !== undefined) return { snapshot: local, source: 'backend' }
  if (seed !== undefined) return { snapshot: seed, source: 'seed' }
  return undefined
}
