/**
 * In-memory copy-on-write holder for the effective model catalog.
 *
 * The store owns exactly one immutable view. Publishing builds the next view,
 * validates ordering, atomically swaps the pointer, and only then notifies
 * subscribers. A reader that captured the previous view keeps a complete,
 * internally consistent catalog; nothing is ever mutated in place.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog/store
 */

import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { applyCatalogDelta } from './delta.ts'
import { ModelCatalogContractError } from './validation.ts'
import type {
  ModelCatalogDelta,
  ModelCatalogSnapshot,
  ModelCatalogSource,
  ModelCatalogView,
} from './types.ts'

/** Options for publishing one view. */
export interface PublishModelCatalogOptions {
  /** Provenance of the snapshot. */
  readonly source: ModelCatalogSource
  /** Publication time override (RFC 3339). */
  readonly loadedAt?: string
}

/** Options for constructing a store. */
export interface ModelCatalogStoreOptions {
  /** Clock used for `loadedAt`; defaults to the system clock. */
  readonly now?: () => Date
}

/**
 * Clone a caller-supplied catalog and deep-freeze the copy, so publishing never
 * mutates an object the caller still holds.
 * @param snapshot - the snapshot to own.
 * @returns an immutable copy.
 */
function ownSnapshot(snapshot: ModelCatalogSnapshot): ModelCatalogSnapshot {
  return deepFreeze(structuredClone(snapshot))
}

/** One immutable catalog holder. */
export class ModelCatalogStore {
  readonly #now: () => Date
  readonly #listeners = new Set<() => void>()
  #view: ModelCatalogView | undefined
  #disposed = false

  constructor(options: ModelCatalogStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date())
  }

  /** The published view, or `undefined` before the first publication. */
  get view(): ModelCatalogView | undefined {
    return this.#view
  }

  /** The published snapshot, or `undefined` before the first publication. */
  snapshot(): ModelCatalogSnapshot | undefined {
    return this.#view?.snapshot
  }

  /**
   * Observe publications. The listener runs after the pointer swap, so it
   * always reads the new view and never a half-built one.
   * @param listener - called once per publication.
   * @returns an idempotent disposer.
   */
  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => {}
    this.#listeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.#listeners.delete(listener)
    }
  }

  /**
   * Publish a snapshot as the new view.
   * @param snapshot - the candidate catalog.
   * @param options - provenance and publication time.
   * @returns the published view.
   * @throws ModelCatalogContractError with `model_catalog.stale_revision` when
   *   the candidate is not newer than the held revision.
   */
  publish(snapshot: ModelCatalogSnapshot, options: PublishModelCatalogOptions): ModelCatalogView {
    if (this.#disposed) throw new Error('model catalog store is disposed')
    const current = this.#view
    // A seed is not part of the server's revision lineage: its number may
    // happen to equal the first backend revision, so only a backend-sourced
    // view gates monotonicity. Replaying an older backend revision is refused.
    if (current !== undefined && current.source === 'backend' && snapshot.revision <= current.snapshot.revision) {
      throw new ModelCatalogContractError(
        'model_catalog.stale_revision',
        `model catalog revision ${snapshot.revision} is not newer than the held revision ${current.snapshot.revision}`,
      )
    }
    const view: ModelCatalogView = Object.freeze({
      snapshot: ownSnapshot(snapshot),
      source: options.source,
      loadedAt: options.loadedAt ?? this.#now().toISOString(),
    })
    this.#view = view
    this.notify()
    return view
  }

  /**
   * Apply one delta through the same commit path as a full snapshot.
   * @param delta - a delta starting at the held revision.
   * @returns the published view.
   */
  applyDelta(delta: ModelCatalogDelta): ModelCatalogView {
    const current = this.#view
    if (current === undefined) {
      throw new ModelCatalogContractError(
        'model_catalog.revision_gap',
        `cannot apply model catalog delta ${delta.baseRevision}->${delta.revision} without a held snapshot`,
      )
    }
    const next = applyCatalogDelta(current.snapshot, delta)
    return this.publish(next, { source: current.source })
  }

  /** Drop the published view and every subscriber. */
  reset(): void {
    this.#view = undefined
  }

  /** Release listeners and the published view; later publications throw. */
  dispose(): void {
    this.#disposed = true
    this.#listeners.clear()
    this.#view = undefined
  }

  private notify(): void {
    // A subscriber must not be able to prevent another subscriber from seeing a
    // committed publication, and must not roll the commit back.
    for (const listener of [...this.#listeners]) {
      try {
        listener()
      } catch {
        // Diagnostics belong to the subscriber; the catalog stays committed.
      }
    }
  }
}
