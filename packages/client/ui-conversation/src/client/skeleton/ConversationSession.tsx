/** Strict per-session header/body content inserted into the resident conversation layout. */

import clsx from 'clsx'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ConversationSessionHeaderSlotProps,
  ConversationSessionSlotProps,
} from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import type { ViewTab } from '../contract/views.ts'
import { resolveActiveView } from '../view-selection.ts'
import { DefaultConversationViews } from './DefaultConversationViews.tsx'
import css from './ConversationRoot.module.css'

/** Full props composed from the strict session body contract. */
export type ConversationSessionProps = ConversationSessionSlotProps

/** Full props composed from the strict session header contract. */
export type ConversationSessionHeaderProps = ConversationSessionHeaderSlotProps

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
  sessionId, renderSlot, open, selectView, ancestry, tabs, active, t,
}: Pick<ConversationSessionHeaderProps,
  'sessionId' | 'renderSlot' | 'open' | 'selectView' | 't'
> & {
  ancestry: readonly Breadcrumb[]
  tabs: readonly ViewTab[]
  active: ViewTab | undefined
}) {
  return (
    <>
      <div className={css.titleCluster}>
        <nav className={css.crumbs} aria-label={t('session.hierarchy')}>
          {ancestry.map((summary: Breadcrumb, index: number) => {
            const last = index === ancestry.length - 1
            const title = (
              <button
                type="button"
                className={clsx(
                  css.crumb,
                  summary.subagent && css.crumbSubagent,
                  last && css.crumbCurrent,
                )}
                disabled={last}
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
        <div className={css.tabs} role="tablist">
          {tabs.map((viewTab: ViewTab) => (
            <button
              key={viewTab.id}
              type="button"
              role="tab"
              aria-selected={viewTab.id === active?.id}
              className={clsx(css.tab, viewTab.id === active?.id && css.tabActive)}
              onClick={() => { selectView(viewTab.id) }}
            >
              {viewTab.label}
            </button>
          ))}
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
  sessionId, useSession, useSessions, useConversation, useConversationViews, useStore,
  renderSlot, open, selectView, t,
}: ConversationSessionHeaderProps) {
  const tabs = useConversationViews(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const ancestry = useSessions(s => deriveAncestry(s, sessionId), equalBreadcrumbs)
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const hideChrome = session.blank && conversationPhase(session, conversation) === 'blank'
  return (
    <header className={clsx(css.header, hideChrome && css.headerBlank)}>
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
                ancestry={ancestry}
                tabs={tabs}
                active={active}
                t={t}
              />
            ),
          },
        )}
        <div className={css.headerCorner} data-conversation-header-corner="">
          {renderSlot('conversation.session.header.corner', {})}
        </div>
      </div>
    </header>
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
