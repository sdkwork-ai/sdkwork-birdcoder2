/** Strict per-session header/body content inserted into the resident conversation layout. */

import { useEffect } from 'react'
import clsx from 'clsx'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ConversationHeaderBreadcrumb, ConversationSessionHeaderSlotProps,
  ConversationSessionSlotProps,
} from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import { resolveActiveView } from '../view-selection.ts'
import css from './ConversationRoot.module.css'

/** Full props composed from the strict session body contract. */
export type ConversationSessionProps = ConversationSessionSlotProps

/** Full props composed from the strict session header contract. */
export type ConversationSessionHeaderProps = ConversationSessionHeaderSlotProps

interface Breadcrumb extends ConversationHeaderBreadcrumb {}

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
 * Upstream header body: breadcrumb cluster + action strip on the left, the
 * View tab strip below, and the utility cluster on the right. Rendered as the
 * fallback of the 'conversation.session.header.surface' seat so plugins can
 * replace the whole header body while this stays mounted as the shell.
 * @param props - Strict Session header render, navigation, and locale shares.
 * @returns the two-row upstream header body.
 */
function ConversationSessionHeaderBody({
  sessionId, renderSlot, open, selectView, ancestry, tabs, active, t,
}: Pick<ConversationSessionHeaderProps,
  'sessionId' | 'renderSlot' | 'open' | 'selectView' | 't'
> & {
  ancestry: readonly Breadcrumb[]
  tabs: readonly import('../contract/views.ts').ViewTab[]
  active: import('../contract/views.ts').ViewTab | undefined
}) {
  return (
    <>
      <div className={css.titleRow}>
        <div className={css.titleCluster}>
          <nav className={css.crumbs} aria-label={t('session.hierarchy')}>
            {ancestry.map((summary, index) => {
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
      </div>
      {tabs.length > 1 && (
        <div className={css.tabs} role="tablist">
          {tabs.map(viewTab => (
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
 * The full header body is delegated to the optional
 * 'conversation.session.header.surface' seat; this entry stays mounted as the
 * shell (blank-session hiding, bottom hairline) and provides its own two-row
 * body as the fallback when no plugin claims the seat.
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns the hidden blank-session header or the delegated header body.
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
    <header
      className={clsx(css.header, hideChrome && css.headerHidden)}
      aria-hidden={hideChrome || undefined}
    >
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
    </header>
  )
}

/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession({
  useSession, useConversation, useConversationViews, useInput, inputActions, useStore, actions,
  renderSlot, bindDraftMirror, openView,
}: ConversationSessionProps) {
  const tabs = useConversationViews(value => value)
  const selectedId = useStore(s => s.view)
  const active = resolveActiveView(tabs, selectedId)
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const inputState = useInput(s => s)
  const storedDraft = useStore(s => s.draft)
  const viewRequest = useStore(s => s.viewRequest ?? null)

  useEffect(() => {
    if (inputState.draft === '' && storedDraft !== '') inputActions.setDraft(storedDraft)
    const unmirror = bindDraftMirror(actions.setDraft)
    return () => { unmirror() }
    // Mount-only (deps pinned to inputActions): later store writes come from
    // the machine mirror, not this seed effect.
  }, [inputActions])

  if (session.blank && conversationPhase(session, conversation) === 'blank') return null
  return (
    <div className={css.viewArea}>
      {active !== undefined && renderSlot('conversation.view', {
        viewRequest,
        openView,
        completeViewRequest: actions.completeViewRequest,
      }, { only: active.id })}
    </div>
  )
}
