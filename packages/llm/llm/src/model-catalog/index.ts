/**
 * Versioned model catalog: wire types, validation, delta application, the
 * copy-on-write store, copy-on-write persistence, source precedence, and the
 * synchronization client.
 *
 * The contract authority is
 * `sdkwork-cloudrouter/docs/architecture/tech/TECH-2026-11-15-model-catalog-sync-api.md`.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog
 */

export * from './types.ts'
export * from './validation.ts'
export * from './delta.ts'
export * from './precedence.ts'
export * from './store.ts'
export * from './persistence.ts'
export * from './sync.ts'
