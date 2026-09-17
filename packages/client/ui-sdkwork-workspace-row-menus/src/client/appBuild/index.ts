/**
 * App-build service assembly: the probe cache and the panel host behind the
 * single `appBuild` face the row menus consume.
 *
 * Keeping the two halves behind one face means the menus never learn whether
 * a catalog came from a live probe or the cache, and never touch the Remote
 * directly — the host capability stays a plugin concern.
 */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { createAppBuildCatalogCache, type AppBuildDescribePort } from './catalogCache.ts'
import {
  createAppBuildPanelHost, type AppBuildIndicatorSnapshot,
} from './panelHost.ts'
import type { AppBuildLocalePort, AppBuildRemoteNamespace, AppBuildService } from './contract.ts'

/** Options of the assembled service. */
export interface CreateAppBuildServiceOptions {
  /** Resolve the live build Remote namespace, or undefined when not mounted. */
  remote: () => AppBuildRemoteNamespace | undefined
  /** Locale seat driving the panel copy. */
  locale: AppBuildLocalePort
}

/** The service plus its teardown, for the plugin's `ctx.effect`. */
export interface AppBuildServiceHandle {
  service: AppBuildService
  /**
   * Observable view of the tracked builds, for the conversation-header
   * indicator. Exposed here rather than through `AppBuildService` because the
   * header is a slot contribution of this plugin, not a row-menu consumer: the
   * service face exists for other plugins, and widening it would make the
   * indicator a cross-plugin contract nobody else asked for.
   */
  indicator: ObservableSnapshot<AppBuildIndicatorSnapshot>
  /** Restore one task's card — the header list's "open detail". */
  expand: (id: string) => void
  dispose(): void
}

/**
 * Assemble the app-build service.
 * @param options - Remote resolver and locale seat.
 * @returns the service face and its teardown.
 */
export function createAppBuildService(options: CreateAppBuildServiceOptions): AppBuildServiceHandle {
  /**
   * Resolve the live namespace, treating any accessor fault as absence.
   *
   * The guard has to live here, not at the call sites: the menus read the
   * catalog fire-and-forget (`void appBuild.describe(cwd)` with no `catch`),
   * so a throw escaping resolution would surface as an unhandled rejection
   * rather than as a menu with no compile/package rows. Beyond a genuinely
   * unmounted namespace, this also absorbs a cordis proxy refusing a
   * `ctx.remote.<ns>` read whose DOTTED inject entry is missing.
   */
  const resolveNamespace = (): AppBuildRemoteNamespace | undefined => {
    try {
      return options.remote()
    } catch {
      return undefined
    }
  }
  const describePort: AppBuildDescribePort = {
    describe: async (cwd) => {
      const namespace = resolveNamespace()
      if (namespace === undefined) return undefined
      try {
        const result = await namespace.describe({ cwd })
        return result.ok ? result.value : undefined
      } catch {
        // A refused probe is an absent catalog, not a menu failure.
        return undefined
      }
    },
  }
  // Without a mounted Remote the cache is bypassed entirely: an absent
  // capability must not pin an empty catalog for the TTL.
  const cache = createAppBuildCatalogCache(
    () => (resolveNamespace() === undefined ? undefined : describePort),
  )
  const panel = createAppBuildPanelHost(options)
  return {
    service: {
      describe: cwd => cache.read(cwd),
      run: (request) => { panel.run(request) },
    },
    indicator: panel.indicator,
    expand: (id) => { panel.expand(id) },
    dispose: () => { panel.dispose() },
  }
}
