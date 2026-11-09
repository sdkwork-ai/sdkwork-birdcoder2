/**
 * The Experts tab's market surface: the expert-market plugin's roster rendered
 * in place.
 *
 * The market is another package's panel ({@link ExpertMarketPanel}), so this
 * file draws no roster of its own — it gives that panel the box the tab's panel
 * area holds and lets it own everything inside: the divisions and their
 * categories, the search, the expert teams, the enable/disable management, the
 * create-with-AI flows and the plugin's update controls. The host box is what
 * the panel's own `height: 100%` needs; the panel scrolls its content itself,
 * so the host never scrolls.
 *
 * The panel is rendered with its registration's injected props: the expert
 * market's panel was written for the `main` seat, where the frame passes the
 * plugin's own translator, remote client and selection callbacks. Drawing it
 * without that face is what made the first integration crash, so the props are
 * part of the panel contract rather than a nicety.
 *
 * A deployment without the market row — or one whose plugin entry is switched
 * off, since the plugin registers its panel only while that entry is enabled —
 * gets the notice instead, saying that the market is unavailable rather than
 * leaving the tab blank. The panel key is the only fact the two packages share
 * (see `expertMarketPanel.ts`).
 */
import { ExpertsIcon } from './icons.tsx'
import type { ExpertMarketPanel } from './expertMarketPanel.ts'
import type { MarketsKey } from './locales.ts'
import css from './MarketsPage.module.css'

/** Props for the Experts tab's market surface. */
export interface ExpertMarketSurfaceProps {
  /** The locale seat (the unavailable notice only; the market draws its own copy). */
  t: (key: MarketsKey) => string
  /** The component and injected props the expert-market plugin registered, or undefined while it is absent. */
  panel: ExpertMarketPanel | undefined
}

/**
 * Render the market or the notice that names its absence.
 * @param props - the locale seat and the registered panel.
 * @returns the market surface element tree.
 */
export function ExpertMarketSurface({ t, panel }: ExpertMarketSurfaceProps) {
  if (panel !== undefined) {
    const Panel = panel.component
    return (
      <div className={css.embeddedPanel} data-expert-market-embedded="">
        <Panel {...panel.injected} />
      </div>
    )
  }
  return (
    <div className={css.marketScroll}>
      <section
        className={css.panelNotice}
        data-expert-market-unavailable=""
        aria-labelledby="experts-market-unavailable-title"
      >
        <span className={css.panelNoticeBadge} aria-hidden="true">
          <ExpertsIcon size={22} />
        </span>
        <h2 id="experts-market-unavailable-title" className={css.panelNoticeTitle}>
          {t('experts.market.unavailable.title')}
        </h2>
        <p className={css.panelNoticeDetail}>{t('experts.market.unavailable.detail')}</p>
      </section>
    </div>
  )
}
