/** Strict per-session header/body content inserted into the resident conversation layout. */

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, IconEllipsisOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ConversationSessionHeaderSlotProps,
  ConversationSessionSlotProps,
  ConversationViewActionsOwnerProps,
} from '../contract/slots.ts'
import type { ViewTab } from '../contract/views.ts'
import { resolveActiveView } from '../view-selection.ts'
import { FIXED_VIEW_ID } from '../view-pins.ts'
import { DefaultConversationViews } from './DefaultConversationViews.tsx'
import css from './ConversationRoot.module.css'

/** Full props composed from the strict session body contract. */
export type ConversationSessionProps = ConversationSessionSlotProps

/** Full props composed from the strict session header contract. */
export type ConversationSessionHeaderProps = ConversationSessionHeaderSlotProps

type ViewsMoreMenuProps =
  Omit<ConversationViewActionsOwnerProps, 'onDismiss'>
  & Pick<ConversationSessionHeaderSlotProps, 'renderSlot'>
  & { readonly label: string; readonly current: boolean }

/** The View tab row's More launcher; its menu rows come from `conversation.session.header.views.actions`. */
function ViewsMoreMenu({ label, current, entries, onOpen, onPinnedChange, renderSlot }: ViewsMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const onDismiss = (): void => { setOpen(false) }
  return (
    <Menu open={open} onClose={onDismiss} portal autoFocus className={css.viewsMoreAnchor} listClassName={css.viewsMoreMenu}
      anchor={(
        <Tooltip label={label} portal>
          <Button size="sm" className={clsx(css.viewsMore, current && css.viewsMoreActive)} aria-label={label} aria-haspopup="menu" aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}>
            <IconEllipsisOutlineRegular size={13} />
          </Button>
        </Tooltip>
      )}>
      {renderSlot('conversation.session.header.views.actions', { entries, onOpen, onPinnedChange, onDismiss })}
    </Menu>
  )
}

/** Approximate 13px text advance: full-width glyphs take one em, other glyphs about half. */
const WIDE_GLYPH = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u
const WIDE_GLYPH_WIDTH = 13
const NARROW_GLYPH_WIDTH = 7
/** Mirrors the `.tabLabel` max-width in `ConversationRoot.module.css`. */
const TAB_LABEL_MAX_WIDTH = 88

/** Estimate whether a View tab label exceeds its 88px cell. */
function labelNeedsTooltip(label: string): boolean {
  let width = 0
  for (const glyph of label) width += WIDE_GLYPH.test(glyph) ? WIDE_GLYPH_WIDTH : NARROW_GLYPH_WIDTH
  return width > TAB_LABEL_MAX_WIDTH
}

/** One View tab label; its full-name tooltip is offered only when the text is expected to overflow. */
function ViewTabLabel({ label }: { readonly label: string }) {
  return (
    <Tooltip label={label} portal disabled={!labelNeedsTooltip(label)}>
      <span className={css.tabLabel}>{label}</span>
    </Tooltip>
  )
}

interface Breadcrumb {
  readonly id: SessionId
  readonly displayTitle: string
  readonly subagent: boolean
}

function deriveAncestry(list: SessionListState, id: SessionId): readonly Breadcrumb[] {
  const chain: Breadcrumb[] = []
  const seen = new Set<SessionId>()
  let cursor: SessionId | undefined = id
  while (cursor !== undefined) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const summary: SessionSummary | undefined = list.byId[cursor]
    if (summary === undefined) break
    chain.unshift({
      id: summary.id,
      displayTitle: summary.displayTitle,
      subagent: summary.origin === 'subagent',
    })
    if (summary.origin !== 'subagent') break
    cursor = summary.parentId
  }
  return chain
}

function equalBreadcrumbs(left: readonly Breadcrumb[], right: readonly Breadcrumb[]): boolean {
  return left.length === right.length
    && left.every((item, index) => {
      const other = right.at(index)
      return other !== undefined && item.id === other.id && item.displayTitle === other.displayTitle
    })
}

/**
 * Upstream header body: the breadcrumb cluster with the action strip on the
 * left, the far-right corner seat, and the full-width View tabs strip below.
 * Rendered as the fallback of the 'conversation.session.header.surface' seat so
 * plugins can replace the header body while this entry stays mounted as the
 * shell (blank-session hiding, bottom hairline, leading seat).
 *
 * The corner seat and the tabs strip live HERE, not in the shell. Both belong
 * to the body a seat claimer replaces: a claimer that brings its own trailing
 * control and its own View navigation must not double with a shell-rendered
 * copy (that is exactly the duplication the fork's segmented control hit after
 * the upstream sync). Keeping them in the fallback makes the seat's unit the
 * whole body, corner and tabs included, for both the upstream and fork bodies.
 * @param props - Strict Session header render, navigation, and locale shares.
 * @returns the upstream header body: title cluster, corner, and tabs strip.
 */
function ConversationSessionHeaderBody({
  sessionId, renderSlot, open, selectView, setPinned, ancestry, tabs, active, unpinned, hasEntryActions, t,
}: Pick<ConversationSessionHeaderProps,
  'sessionId' | 'renderSlot' | 'open' | 'selectView' | 'setPinned' | 't'
> & {
  ancestry: readonly Breadcrumb[]
  tabs: readonly ViewTab[]
  active: ViewTab | undefined
  /** View ids the user unpinned; every other registered View shows as a tab. */
  unpinned: readonly string[]
  /** Whether any `conversation.session.header.views.actions` entry registered. */
  hasEntryActions: boolean
}) {
  // FORK DIVERGENCE: the store subscriptions (tabs, active, ancestry, unpinned,
  // hasEntryActions) live in the shell `ConversationSessionHeader` below, which
  // passes them down as props; only the body-local tab overflow logic from the
  // upstream single-component form runs here.
  const showTabs = tabs.length > 1
  const tabRow = useRef<HTMLDivElement>(null)
  const [visibleViewLimit, setVisibleViewLimit] = useState(1)
  // Observe only the available row width; individual tabs are not measured.
  useLayoutEffect(() => {
    const row = tabRow.current
    if (row === null || !hasEntryActions) return
    const updateLimit = (): void => {
      setVisibleViewLimit(Math.max(1, Math.floor((row.clientWidth - 48) / 120)))
    }
    updateLimit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateLimit)
    observer.observe(row)
    return () => { observer.disconnect() }
  }, [showTabs, hasEntryActions])
  const { visibleTabs, moreTabs } = useMemo(() => {
    const preferred = [
      ...tabs.filter(tab => tab.id === FIXED_VIEW_ID),
      ...tabs.filter(tab => tab.id !== FIXED_VIEW_ID && !unpinned.includes(tab.id)),
    ]
    const visibleTabs = hasEntryActions ? preferred.slice(0, visibleViewLimit) : preferred
    const visibleIds = new Set(visibleTabs.map(tab => tab.id))
    return { visibleTabs, moreTabs: tabs.filter(tab => !visibleIds.has(tab.id)) }
  }, [tabs, unpinned, hasEntryActions, visibleViewLimit])
  const currentInMore = moreTabs.some(tab => tab.id === active?.id)
  return (
    <>
      <div className={css.titleCluster}>
        <nav className={css.crumbs} aria-label={t('session.hierarchy')}>
          {ancestry.map((summary: Breadcrumb, index: number) => {
            const last = index === ancestry.length - 1
            // The current crumb has no navigation, so it is plain text
            // rather than a disabled button: on darwin desktop a button
            // would subtract itself from the header's drag row (ui-web
            // base.css) and leave the title inert for dragging too.
            const title = last
              ? (
                <span className={clsx(css.crumb, summary.subagent && css.crumbSubagent, css.crumbCurrent)}>
                  {summary.displayTitle}
                </span>
              )
              : (
                <button
                  type="button"
                  className={clsx(css.crumb, summary.subagent && css.crumbSubagent)}
                  onClick={() => { open(summary.id) }}
                >
                  {summary.displayTitle}
                </button>
              )
            const lineage = last || summary.subagent
            const lineageOwner = {
              lineageSessionId: summary.id,
              displayTitle: summary.displayTitle,
              ...last ? {} : { openTitle: () => { open(summary.id) } },
            }
            return (
              <span key={summary.id} className={css.crumbSeg}>
                {index > 0 && <span className={css.crumbSep}>/</span>}
                {lineage
                  ? summary.subagent
                    ? renderSlot(
                      'conversation.session.header.lineage',
                      lineageOwner,
                      { fallback: title },
                    )
                    : (
                      <>
                        {title}
                        {renderSlot(
                          'conversation.session.header.lineage',
                          lineageOwner,
                          { fallback: null },
                        )}
                      </>
                    )
                  : title}
              </span>
            )
          })}
          {ancestry.length === 0 && <span className={css.crumbCurrent}>{sessionId}</span>}
        </nav>
        <div className={css.headerActions}>
          {renderSlot('conversation.session.header.actions', {})}
        </div>
      </div>
      <div className={css.headerUtilities}>
        {renderSlot('conversation.session.header.utilities', {})}
      </div>
      {tabs.length > 1 && (
        // data-conversation-tabs: marks the tab strip, which the window-chrome
        // geometry and the browser coverage lane anchor on.
        <div ref={tabRow} className={css.tabs}>
          <div className={css.viewTabs} role="tablist" data-conversation-tabs="">
            {visibleTabs.map(viewTab => (
              <button
                key={viewTab.id}
                type="button"
                role="tab"
                aria-selected={viewTab.id === active?.id}
                className={clsx(css.tab, viewTab.id === active?.id && css.tabActive)}
                onClick={() => { selectView(viewTab.id) }}
              >
                <ViewTabLabel label={viewTab.label} />
              </button>
            ))}
          </div>
          {hasEntryActions && (
            <ViewsMoreMenu
              label={t('session.moreViews')}
              current={currentInMore}
              entries={moreTabs.map(viewTab => ({
                id: viewTab.id, label: viewTab.label,
                pinned: !unpinned.includes(viewTab.id), active: viewTab.id === active?.id,
              }))}
              onOpen={selectView}
              onPinnedChange={setPinned}
              renderSlot={renderSlot}
            />
          )}
        </div>
      )}
    </>
  )
}

/**
 * Renders Session header chrome above the resident conversation scrollport.
 *
 * The header body is delegated to the optional
 * 'conversation.session.header.surface' seat; this entry stays mounted as the
 * shell and keeps what no seat occupant may re-implement: the blank-session
 * hiding, the bottom hairline, and the leading seat.
 *
 * The seat's unit is the whole body — the title row content plus the corner
 * seat and the second-row View tabs strip — so a claimer that brings its own
 * trailing control and View navigation replaces them instead of doubling with
 * them (that duplication is exactly what the fork's segmented control hit
 * after the upstream sync).
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns Session navigation controls, with title and tabs after conversation starts.
 */
export function ConversationSessionHeader({
  sessionId, hideChrome, useSessions, useConversationViews, useStore,
  renderSlot, open, selectView, setPinned, t, useEntryPins, useEntryActions,
}: ConversationSessionHeaderProps) {
  const tabs = useConversationViews(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const ancestry = useSessions(s => deriveAncestry(s, sessionId), equalBreadcrumbs)
  // Subscribed in the shell, not the body: a seat claimer replacing the body
  // must not silently drop the View pin/menu wiring the fallback relies on.
  const unpinned = useEntryPins(ids => ids)
  const hasEntryActions = useEntryActions(registered => registered)
  return (
    <>
      <div className={css.titleRow}>
        <div className={css.headerLeading} data-conversation-header-leading="">
          {renderSlot('conversation.session.header.leading', {})}
        </div>
        {!hideChrome && renderSlot(
          'conversation.session.header.surface',
          {
            renderSlot,
            open,
            selectView,
            ancestry,
            views: tabs,
            activeViewId: active?.id ?? null,
          },
          {
            // The upstream body owns BOTH of the header's rows: the title row
            // content (breadcrumbs / actions / utilities) and the View tabs
            // strip below it. A seat claimer replaces that whole body, tabs
            // included, which is what keeps a fork segmented control from
            // doubling with an upstream strip the shell would otherwise own.
            fallback: (
              <ConversationSessionHeaderBody
                sessionId={sessionId}
                renderSlot={renderSlot}
                open={open}
                selectView={selectView}
                setPinned={setPinned}
                ancestry={ancestry}
                tabs={tabs}
                active={active}
                unpinned={unpinned}
                hasEntryActions={hasEntryActions}
                t={t}
              />
            ),
          },
        )}
        <div className={css.headerCorner} data-conversation-header-corner="">
          {renderSlot('conversation.session.header.corner', {})}
        </div>
      </div>
    </>
  )
}

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession(props: ConversationSessionProps) {
  return <DefaultConversationViews {...props} />
}
