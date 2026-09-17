/**
 * Cached app-build catalog reads.
 *
 * The catalog is read every time a row menu opens, so the cache is what keeps
 * the menu instant: a probe costs one directory listing plus one read per app
 * root, which is too much to pay on every click. The TTL stays short because
 * a workspace is a live tree — adding an `apps/<…>-pc` root must appear
 * without a reload, while the menu must not re-probe on every open.
 *
 * A failed probe is never cached: the next open retries, so a transient
 * host hiccup cannot pin an empty menu for the whole TTL.
 */

import type { AppBuildCatalog } from './contract.ts'

/** Probe port: the Remote call, absent when no build Remote is mounted. */
export interface AppBuildDescribePort {
  describe(cwd: string): Promise<AppBuildCatalog | undefined>
}

/** Cached-catalog lifetime: long enough to keep menus instant, short enough to notice a new app root. */
const CACHE_TTL_MS = 15_000

/** Workspaces kept cached at once; the sidebar browses a bounded set. */
const MAX_CACHED_WORKSPACES = 32

/** Catalog reader the menus call. */
export interface AppBuildCatalogCache {
  /** Read one workspace's catalog, probing through the port when stale. */
  read(cwd: string): Promise<AppBuildCatalog | undefined>
  /** Drop every cached catalog (the next read re-probes). */
  invalidate(): void
}

/**
 * Build a TTL cache over the describe port.
 * @param port - resolves the live probe port, or undefined when the build
 *   Remote is not mounted.
 * @param now - clock seam (tests pin it).
 * @returns the catalog reader.
 */
export function createAppBuildCatalogCache(
  port: () => AppBuildDescribePort | undefined,
  now: () => number = () => Date.now(),
): AppBuildCatalogCache {
  const entries = new Map<string, { at: number; catalog: AppBuildCatalog | undefined }>()
  const inflight = new Map<string, Promise<AppBuildCatalog | undefined>>()

  function remember(cwd: string, catalog: AppBuildCatalog | undefined): void {
    // Re-insert to move the key to the end: Map iteration order is the LRU order.
    entries.delete(cwd)
    entries.set(cwd, { at: now(), catalog })
    while (entries.size > MAX_CACHED_WORKSPACES) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  async function read(cwd: string): Promise<AppBuildCatalog | undefined> {
    const fresh = entries.get(cwd)
    if (fresh !== undefined && now() - fresh.at < CACHE_TTL_MS) return fresh.catalog
    // One probe per workspace at a time: opening several menus in a row must
    // not fan out into concurrent identical listings.
    const running = inflight.get(cwd)
    if (running !== undefined) return running
    const probe = port()
    if (probe === undefined) return undefined
    const pending = probe.describe(cwd).then(
      (catalog) => {
        inflight.delete(cwd)
        remember(cwd, catalog)
        return catalog
      },
      () => {
        inflight.delete(cwd)
        return undefined
      },
    )
    inflight.set(cwd, pending)
    return pending
  }

  return { read, invalidate: () => { entries.clear() } }
}
