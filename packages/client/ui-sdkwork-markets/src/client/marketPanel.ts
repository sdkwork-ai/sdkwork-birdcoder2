/**
 * The bridge to the `dshmarket` plugin's own market panel.
 *
 * The plugin market is a separate package installed into the profile, not a
 * page this plugin owns: `dshmarket` publishes a `market` client service so a
 * host shell can render its panel inside its own container
 * (`ctx.market.render({ surface: 'plugins' })`). This module is the receiving
 * end of that contract — a published value the page binds beside its store, so
 * a plugin that loads after this page mounted still lands (and a plugin that is
 * unloaded takes its panel away instead of leaving a dead frame).
 *
 * The service is optional by construction. This package ships inside the
 * application; the market is installed into a profile. A deployment without it
 * must render a complete page (the install affordance), never a blank panel, so
 * every read here answers `undefined` until a control with the contract's
 * version and `render` method has been attached.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/marketPanel
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** The contract version this page understands. */
export const MARKET_CONTROL_VERSION = 1

/**
 * The subset of `dshmarket`'s published `market` service this page uses.
 *
 * Declared structurally rather than imported: the package is an external
 * profile plugin, so importing its types would make this in-box package depend
 * on a package that may not be installed at all.
 */
export interface MarketControl {
  /** The contract revision; a different one is not rendered. */
  readonly version: typeof MARKET_CONTROL_VERSION
  /**
   * Build the market panel's element. The market owns its own chrome, filters,
   * install dialog, and updates; this page only gives it the viewport.
   * @param props - where the panel is mounted and, optionally, a subsection to open.
   * @returns the panel element (a React node in the host's React instance).
   */
  render(props?: { preferredSubsectionId?: string; surface?: 'settings' | 'sidebar' | 'plugins' }): unknown
}

/** The published control plus the owner's operations. */
export interface MarketsMarketControl extends HostObservable<MarketControl | undefined> {
  /**
   * Publish one control offered by a plugin that just provided the service.
   * A value that does not satisfy {@link MarketControl} is ignored, so a future
   * contract revision degrades to the install affordance instead of crashing
   * the page.
   * @param value - the provided service, as received from cordis.
   */
  attach(value: unknown): void
  /** Withdraw the published control (the providing plugin went away). */
  detach(): void
}

/**
 * Read a provided value as a {@link MarketControl}.
 * @param value - the provided service value.
 * @returns the control, or undefined when it is not the understood contract.
 */
export function asMarketControl(value: unknown): MarketControl | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as { version?: unknown; render?: unknown }
  if (candidate.version !== MARKET_CONTROL_VERSION) return undefined
  if (typeof candidate.render !== 'function') return undefined
  return candidate as MarketControl
}

/**
 * Create the published-control ledger.
 * @returns the observable control and the owner's attach/detach operations.
 */
export function createMarketPanelSource(): MarketsMarketControl {
  // A stable snapshot: the same control reference between publishes, so
  // `useSyncExternalStore` never sees a fresh value on an unchanged fact.
  let control: MarketControl | undefined
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }
  return {
    getSnapshot: () => control,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    attach(value) {
      const next = asMarketControl(value)
      if (next === undefined || next === control) return
      control = next
      notify()
    },
    detach() {
      if (control === undefined) return
      control = undefined
      notify()
    },
  }
}
