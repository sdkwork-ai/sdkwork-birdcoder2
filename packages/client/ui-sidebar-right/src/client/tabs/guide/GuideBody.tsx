/**
 * The guide tab's body: a chain host, and the guide it falls back to.
 *
 * The chain is the replacement seam. A product with its own idea of what an
 * empty sidebar should say registers into `sidebar.right.tab.guide`, and its entry
 * takes the whole body; with no entry, or with every entry declining, the guide
 * below renders. The shipped guide is the owner's fallback rather than a chain
 * entry of its own, so there is always exactly one body and the shipped one
 * cannot be outvoted by accident.
 *
 * The shipped guide is the entry capsules every registered type contributed,
 * centred in the body, and nothing else. Picking one opens that type as a page
 * in this tab's place, so the guide is a doorway rather than a page that stays
 * open.
 */
import type { ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ChainRenderOpts, HookContextOf, InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightGuideBox } from '../../tab-registry.ts'
import css from './GuideBody.module.css'

/** What the guide body needs from its host beyond the framework shares. */
export interface GuideInjected {
  /** The registry's guide entries in `order`; observable, so a type registering later appears. */
  readonly hooks: { readonly guideEntries: ObservableSnapshot<readonly SidebarRightGuideBox[]> }
}

/** The guide body's composed props: the tab it draws, its chain child, and the entries. Its words are the entries' own. */
export type GuideBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsRenderSlots<'sidebar.right.tab.guide'>
  & InjectFace<GuideInjected>

/** One entry capsule: the contributing type's glyph and title. */
function EntryBox({ entry, onPick }: { entry: SidebarRightGuideBox; onPick: (entry: SidebarRightGuideBox) => void }): ReactNode {
  const Icon = entry.icon
  return (
    <button
      type="button"
      className={css.entry}
      data-sidebar-right-guide-entry={entry.kind}
      onClick={() => { onPick(entry) }}
    >
      {Icon !== undefined && <span className={css.entryIcon}><Icon size={16} /></span>}
      <span className={css.entryTitle}>{entry.title()}</span>
    </button>
  )
}

/** The shipped guide: the doors out of the column. */
function ShippedGuide({ entries, onPick }: {
  entries: readonly SidebarRightGuideBox[]
  onPick: (entry: SidebarRightGuideBox) => void
}): ReactNode {
  return (
    <div className={css.guide} data-sidebar-right-guide>
      {/* Keyed by position in the ordered list: one type may contribute several capsules, and `order` is not unique. */}
      {entries.map((entry, index) => <EntryBox key={`${entry.kind}:${index}`} entry={entry} onPick={onPick} />)}
    </div>
  )
}

/** The guide tab's body, replaceable through its chain child. */
export function GuideBody({ useTabInfo, useGuideEntries, renderSlotChain }: GuideBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const entries = useGuideEntries(entries => entries)
  const options = {
    hookContext: useTabInfo,
    fallback: (
      <ShippedGuide entries={entries} onPick={(entry) => { tab.actions.openTab(entry.kind, { replaceTab: true }) }} />
    ),
  } satisfies ChainRenderOpts & { hookContext: HookContextOf<'sidebar.right.tab.guide'> }
  return renderSlotChain('sidebar.right.tab.guide', {}, options)
}
