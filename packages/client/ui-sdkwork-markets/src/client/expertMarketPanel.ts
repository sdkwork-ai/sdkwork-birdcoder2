/**
 * The bridge to the expert-market plugin's own roster panel.
 *
 * The expert market is a separate package (`@michengai/dsh-agency-agents`,
 * linked into this repository as the `plugins/sdkwork-dsh-agents` submodule and
 * mounted by the web-app bundle patch), not a page this plugin owns. It
 * publishes no client service — its browser half registers a keyed `main`
 * panel plus its sidebar row — so the only identity the two packages share is
 * that panel key, and the only source this page can read is the live `main`
 * ledger.
 *
 * The registration carries the plugin's whole panel: the 331-expert roster
 * with its divisions, the built-in expert teams, the create-with-AI entry
 * points, the enable/disable management and the update controls. The Experts
 * tab renders it in place, so the market becomes the tab's own content instead
 * of a hand-over to a second page; the component takes no slot props, which is
 * what makes rendering it outside its declared seat safe.
 *
 * The plugin registers that panel only while its own entry is enabled, so the
 * web-app row pins `entryLocation: both`. When a deployment disables the row
 * (or the person switches the plugin's own entry off) the source answers
 * `undefined` and the tab shows the notice that names the absence, never a dead
 * control.
 *
 * The panel key is the one place the two packages touch, so it lives here as
 * an explicit contract rather than a string in the render code: the bundle
 * acceptance spec reads the shipped `lib/client.js` and fails if the plugin
 * ever registers its panel under a different key.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/expertMarketPanel
 */

import { watchPanelComponent, type MainPanelLedger, type PanelComponent, type PanelComponentSource } from './mainPanelWatch.ts'

/**
 * The keyed `main` panel the expert-market plugin registers its roster under.
 * It is also the id of that plugin's `sidebar.panellist` row, which the
 * Experts tab suppresses because it embeds the panel.
 */
export const EXPERT_MARKET_PANEL_ID = 'agency-agents'

/** The surface the expert-market plugin registered for its roster. */
export type ExpertMarketPanel = PanelComponent

/** The subset of the slot registry this module reads. */
export type ExpertMarketPanelLedger = MainPanelLedger

/** The panel source plus its owner's disposal. */
export type ExpertMarketPanelSource = PanelComponentSource

/**
 * Create the live source for the expert market's panel.
 * @param slots - the slot registry the page's plugin already injects.
 * @returns the observable panel and the owner's disposal.
 */
export function createExpertMarketPanelSource(slots: ExpertMarketPanelLedger): ExpertMarketPanelSource {
  return watchPanelComponent(slots, EXPERT_MARKET_PANEL_ID)
}
