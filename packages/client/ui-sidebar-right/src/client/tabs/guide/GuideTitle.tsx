/**
 * The guide type's chip title: the compass before the type's label. Registered
 * under `sidebar.right.pane.tab.title`; without it the chip would show the
 * bare label.
 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './GuideBody.module.css'

/**
 * The compass: a grey ring with the needle's rhombus pointing north-east.
 */
function CompassGlyph(): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={css.titleIcon}>
      <circle cx="8" cy="8" r="6" stroke="var(--dsw-alias-label-tertiary)" strokeWidth="1.4" />
      <path d="M 10.9 5.1 L 9.1 9.1 L 5.1 10.9 L 6.9 6.9 Z" fill="var(--dsw-alias-label-tertiary)" />
    </svg>
  )
}

/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the compass followed by the tab's title text.
 */
export function GuideTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <CompassGlyph />
      {tab.title}
    </>
  )
}
