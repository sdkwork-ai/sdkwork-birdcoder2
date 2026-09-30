/**
 * The `pluginNavigation` contract's request owner.
 *
 * Upstream's Plugins page provided this service so another plugin could ask for
 * one bundle's details (`ctx.pluginNavigation.openBundle(packageName)`) without
 * changing the current Session. This plugin owns the plugin surface now, so it
 * owns that contract too. The request is a published value the page consumes
 * and acknowledges rather than an event, so a request made while the market
 * surface is closed still lands when it opens.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/plugin-navigation
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** The published request plus the operations its owner drives. */
export interface MarketsPluginNavigation {
  /** The pending request the page binds beside its store. */
  readonly hooks: { readonly bundleRequest: HostObservable<string | undefined> }
  /**
   * Publish one bundle-detail request.
   * @param packageName - npm package name of the bundle to show.
   */
  publish(packageName: string): void
  /** Clear the request once the page has opened it. */
  handled(): void
}

/**
 * Create the request ledger.
 * @returns the observable request and the owner's operations.
 */
export function createPluginNavigation(): MarketsPluginNavigation {
  let request: string | undefined
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }
  return {
    hooks: {
      bundleRequest: {
        // A string or undefined between changes, so a subscriber's snapshot
        // stays reference-stable exactly as `useSyncExternalStore` requires.
        getSnapshot: () => request,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      },
    },
    publish(packageName) {
      request = packageName
      notify()
    },
    handled() {
      if (request === undefined) return
      request = undefined
      notify()
    },
  }
}
