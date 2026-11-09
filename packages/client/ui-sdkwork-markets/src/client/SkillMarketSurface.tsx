/**
 * The Skills tab's market surface: the SkillHub market rendered in place.
 *
 * The market is another package's panel ({@link SkillMarketPanel}), so this
 * file draws no catalog of its own — it gives that panel the box the tab's
 * panel area holds and lets it own everything inside: its search, its
 * categories, its cards, its detail drawer, and its install and management
 * flows. The host box is what the panel's own `height: 100%` needs; the panel
 * scrolls its content itself, so the host never scrolls.
 *
 * The panel is rendered with its registration's injected props. The SkillHub
 * market declares none today (it is prop-free, which is also what makes drawing
 * it outside its declared seat safe), so the spread is empty; passing whatever
 * a future registration injects keeps this surface honest instead of silently
 * dropping a face the panel was written for.
 *
 * A deployment without the market row (or one whose client half has not
 * loaded yet) gets the notice instead, saying that the market is unavailable
 * rather than leaving the tab blank. The panel key is the only fact the two
 * packages share (see `skillMarketPanel.ts`).
 */
import { MarketsIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import type { SkillMarketPanel } from './skillMarketPanel.ts'
import css from './MarketsPage.module.css'

/** Props for the Skills tab's market surface. */
export interface SkillMarketSurfaceProps {
  /** The locale seat (the unavailable notice only; the market draws its own copy). */
  t: (key: MarketsKey) => string
  /** The component and injected props the skill-market plugin registered, or undefined while it is absent. */
  panel: SkillMarketPanel | undefined
}

/**
 * Render the market or the notice that names its absence.
 * @param props - the locale seat and the registered panel.
 * @returns the market surface element tree.
 */
export function SkillMarketSurface({ t, panel }: SkillMarketSurfaceProps) {
  if (panel !== undefined) {
    const Panel = panel.component
    return (
      <div className={css.embeddedPanel} data-skill-market-embedded="">
        <Panel {...panel.injected} />
      </div>
    )
  }
  return (
    <div className={css.marketScroll}>
      <section
        className={css.panelNotice}
        data-skill-market-unavailable=""
        aria-labelledby="skills-market-unavailable-title"
      >
        <span className={css.panelNoticeBadge} aria-hidden="true">
          <MarketsIcon size={22} />
        </span>
        <h2 id="skills-market-unavailable-title" className={css.panelNoticeTitle}>
          {t('skills.market.unavailable.title')}
        </h2>
        <p className={css.panelNoticeDetail}>{t('skills.market.unavailable.detail')}</p>
      </section>
    </div>
  )
}
