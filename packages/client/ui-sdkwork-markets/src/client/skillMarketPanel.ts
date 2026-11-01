/**
 * The bridge to the `dsh-skill-market` plugin's own SkillHub panel.
 *
 * The skill market is a separate package (`@montersy123/dsh-skill-market`,
 * linked into this repository as the `plugins/dsh-skill-market` submodule and
 * mounted by the web-app bundle patch), not a page this plugin owns. It
 * publishes no client service — it registers a keyed `main` panel and its
 * sidebar row directly — so the only identity the two packages share is that
 * panel key, and the only source this page can read is the live `main` ledger.
 *
 * The registration carries the market's whole component, so the Skills tab
 * renders it in place: the market becomes the tab's own content instead of a
 * hand-over to a second page. The component keeps its own state and talks to
 * the plugin's Host half through the same-origin `/skill-market/api/*` prefix,
 * so nothing is copied and nothing is asked of the package. It takes no slot
 * props, which is what makes rendering it outside its declared seat safe.
 *
 * The panel key is the one place the two packages touch, so it lives here as
 * an explicit contract rather than a string in the render code: the bundle
 * acceptance spec reads the shipped `lib/client.js` and fails if the plugin
 * ever registers its panel under a different key.
 *
 * The source is optional by construction: a deployment that disables the row
 * keeps a complete page (the unavailable notice), never a dead control, so
 * every read answers `undefined` until a panel with that key is registered and
 * returns to `undefined` when it goes away.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/skillMarketPanel
 */

import type { ComponentType } from 'react'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { watchMainPanel, type MainPanelLedger } from './mainPanelWatch.ts'

/**
 * The keyed `main` panel the `dsh-skill-market` plugin registers its market
 * page under. It is also the id of that plugin's `sidebar.panellist` row.
 */
export const SKILL_MARKET_PANEL_ID = 'skill-market'

/** The surface the skill-market plugin registered for its market page. */
export interface SkillMarketPanel {
  /**
   * The plugin's market component: discovery, search, install, and the
   * installed/imported management views, all in one self-contained tree.
   */
  readonly component: ComponentType
}

/** The subset of the slot registry this module reads. */
export type SkillMarketPanelLedger = MainPanelLedger

/** The panel source plus its owner's disposal. */
export interface SkillMarketPanelSource extends HostObservable<SkillMarketPanel | undefined> {
  /** Stop observing the ledger (the plugin's own effect scope owns this). */
  dispose(): void
}

/**
 * Create the live source for the skill market's panel.
 * @param slots - the slot registry the page's plugin already injects.
 * @returns the observable panel and the owner's disposal.
 */
export function createSkillMarketPanelSource(slots: SkillMarketPanelLedger): SkillMarketPanelSource {
  const entry = watchMainPanel(slots, SKILL_MARKET_PANEL_ID)
  // One wrapper object per registered component: the snapshot feeds the page's
  // `useSyncExternalStore`, and a fresh object per read would re-render (and
  // remount the market) after every unrelated panel registration.
  let published: SkillMarketPanel | undefined
  return {
    getSnapshot() {
      const component = entry.getSnapshot()
      if (component === undefined) {
        published = undefined
        return undefined
      }
      if (published?.component !== component) published = { component }
      return published
    },
    subscribe(listener) {
      return entry.subscribe(listener)
    },
    dispose() {
      entry.dispose()
    },
  }
}
