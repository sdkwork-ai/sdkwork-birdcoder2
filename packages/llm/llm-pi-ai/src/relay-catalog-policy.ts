/**
 * Runtime exposure policy for the harness-shipped relay routes.
 *
 * A relay route seeds from the SDKWork models catalog projected at build time
 * (`relay-models.generated.ts`), which is what makes the picker usable before
 * any deployment is reachable. A deployment also has an operator-authored
 * front-end model configuration (which catalog models each product surface
 * exposes, in which order, enabled or disabled). That document changes at
 * runtime, long after the build, so it cannot live in the seed.
 *
 * This module is the seam between the two: the relay catalog reader consults
 * the policy published here, and a loader plugin publishes it. The policy is an
 * ordered allow-list of catalog keys. Absence of a policy means "the seed is
 * authoritative"; an empty list means "the operator exposed nothing", which is
 * a valid (if severe) answer and must not silently fall back to the seed.
 *
 * The policy is process-local, bounded, immutable per publication, and
 * versioned so consumers can memoize catalogs by version identity. Publication
 * is synchronous and copy-on-write: a reader that captured a policy keeps a
 * complete answer.
 *
 * @module @deepseek-ai/dsh-llm-pi-ai/relay-catalog-policy
 */

/** One operator-authored exposure policy for a relay route. */
export interface RelayCatalogPolicy {
  /**
   * Catalog keys the operator exposes, in presentation order. Keys are
   * `<vendorCode>/<modelId>`; duplicates are removed on publication.
   */
  readonly catalogKeys: readonly string[]
  /** Published front-end configuration revision, for diagnostics. */
  readonly revision: number
  /** Observation time (ISO-8601) of the document this policy came from. */
  readonly updatedAt: string
  /** Where the policy came from, e.g. `app-api:frontend_config`. */
  readonly source: string
}

/** Upper bound on the keys one policy may carry, comfortably above any catalog. */
const MAX_POLICY_KEYS = 20_000

/** Upper bound on the routes one process may hold a policy for. */
const MAX_POLICIES = 32

let policies = new Map<string, RelayCatalogPolicy>()
let version = 0
const listeners = new Set<(provider: string) => void>()

/**
 * The current publication version. Every effective publication advances it,
 * so a consumer can use it as a memoization identity.
 * @returns the monotonically increasing version.
 */
export function relayCatalogPolicyVersion(): number {
  return version
}

/**
 * The policy published for one route, if any.
 * @param provider - relay route key.
 * @returns the immutable policy, or `undefined` when the seed is authoritative.
 */
export function relayCatalogPolicy(provider: string): RelayCatalogPolicy | undefined {
  return policies.get(provider)
}

/**
 * Normalize an operator list: trim, drop blanks, dedupe preserving order, and
 * bound the result.
 * @param catalogKeys - keys as they arrived on the wire.
 * @returns the normalized keys.
 */
function normalizeKeys(catalogKeys: readonly string[]): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const candidate of catalogKeys) {
    if (typeof candidate !== 'string') continue
    const key = candidate.trim()
    if (key.length === 0 || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
    if (keys.length >= MAX_POLICY_KEYS) break
  }
  return keys
}

/**
 * Whether two policies are semantically identical.
 * @param left - current policy, when present.
 * @param right - candidate policy.
 * @returns whether publishing `right` would change anything.
 */
function samePolicy(left: RelayCatalogPolicy | undefined, right: RelayCatalogPolicy): boolean {
  if (left === undefined) return false
  if (left.revision !== right.revision || left.source !== right.source) return false
  if (left.catalogKeys.length !== right.catalogKeys.length) return false
  return left.catalogKeys.every((key, index) => key === right.catalogKeys[index])
}

/**
 * Publish one route's exposure policy.
 *
 * Publication is idempotent: an unchanged list for the same revision does not
 * bump the version, so consumers are not told to reload a catalog that did not
 * change. The stored value is frozen.
 * @param provider - relay route key.
 * @param policy - the observed policy.
 * @returns whether the publication changed the process state.
 */
export function setRelayCatalogPolicy(provider: string, policy: RelayCatalogPolicy): boolean {
  const normalized: RelayCatalogPolicy = Object.freeze({
    catalogKeys: Object.freeze(normalizeKeys(policy.catalogKeys)),
    revision: Number.isFinite(policy.revision) ? Math.max(0, Math.trunc(policy.revision)) : 0,
    updatedAt: policy.updatedAt,
    source: policy.source,
  })
  if (samePolicy(policies.get(provider), normalized)) return false
  if (policies.size >= MAX_POLICIES && !policies.has(provider)) {
    // A route set this large is a composition error, not an operator intent;
    // refusing the excess keeps memory bounded without dropping live routes.
    return false
  }
  const next = new Map(policies)
  next.set(provider, normalized)
  policies = next
  version += 1
  for (const listener of listeners) {
    try {
      listener(provider)
    } catch {
      // An observer must not veto a publication it observes.
    }
  }
  return true
}

/**
 * Remove one route's policy, returning the seed to authority.
 * @param provider - relay route key.
 * @returns whether a policy was removed.
 */
export function clearRelayCatalogPolicy(provider: string): boolean {
  if (!policies.has(provider)) return false
  const next = new Map(policies)
  next.delete(provider)
  policies = next
  version += 1
  for (const listener of listeners) {
    try {
      listener(provider)
    } catch {
      // See setRelayCatalogPolicy.
    }
  }
  return true
}

/**
 * Observe effective policy publications.
 * @param listener - called with the changed route key.
 * @returns a disposer.
 */
export function subscribeRelayCatalogPolicy(listener: (provider: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Test-only reset. Not exported through the package entry point.
 */
export function resetRelayCatalogPoliciesForTest(): void {
  policies = new Map()
  version = 0
  listeners.clear()
}
