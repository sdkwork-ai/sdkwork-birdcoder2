/*
 * SDKWork conversation header surface: the full body of the conversation
 * Session header in ONE row — breadcrumb cluster + action strip on the left,
 * an icon+label segmented control (replacing the former full-width View tabs
 * strip) centered in the row, and the utility cluster on the right. The
 * upstream header entry stays mounted as the shell (blank-session hiding,
 * bottom hairline) and renders its own two-row body as the fallback.
 *
 * All reactivity rides the owner share handed down by the upstream header
 * entry; this component is a pure function of props.
 */
import clsx from 'clsx'
import { Folder, MessageSquare, Route } from 'lucide-react'
import type {
  ConversationHeaderBreadcrumb, ConversationHeaderSurfaceSlotProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import { NS } from './locales.ts'
import css from './ConversationHeader.module.css'

/** Full component props: owner share (parent reactivity) + this plugin's locale. */
export type SdkworkConversationHeaderProps =
  ConversationHeaderSurfaceSlotProps & PropsLocale<typeof NS>

/** View-id → glyph table for the segmented control (unknown ids render label-only). */
const VIEW_ICONS = {
  chat: MessageSquare,
  trajectory: Route,
} as const

/**
 * Render the SDKWork conversation header body.
 * @param props - owner share handed down by the upstream header entry plus the locale seat.
 * @returns the single-row header body: breadcrumbs | project chip | segmented view control | actions/utilities.
 */
export function SdkworkConversationHeader({
  sessionId, useSessions, renderSlot, open, selectView, ancestry, views, activeViewId, t,
}: SdkworkConversationHeaderProps) {
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const workspace = cwd === undefined || cwd.trim() === '' ? null : workspaceTitleOf(cwd)

  return (
    <div className={css.titleRow}>
      <div className={css.titleCluster}>
        <nav
          className={css.crumbs}
          aria-label={t('header.viewsAria')}
          data-conversation-crumbs=""
        >
          {ancestry.map((summary: ConversationHeaderBreadcrumb, index: number) => {
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
          {ancestry.length === 0 && (
            <span className={css.crumbCurrent} data-conversation-crumb-id="">
              {sessionId}
            </span>
          )}
        </nav>
        {workspace !== null && (
          <span className={css.workspaceChip} title={cwd} aria-label={t('header.workspaceAria')}>
            <Folder size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className={css.workspaceName}>{workspace}</span>
          </span>
        )}
        <div className={css.headerActions}>
          {renderSlot('conversation.session.header.actions', {})}
        </div>
      </div>
      {views.length > 1 && (
        <div className={css.center}>
          <div className={css.segments} role="tablist" aria-label={t('header.viewsAria')}>
            {views.map((viewTab) => {
              const Icon = VIEW_ICONS[viewTab.id as keyof typeof VIEW_ICONS]
              return (
                <button
                  key={viewTab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewTab.id === activeViewId}
                  title={viewTab.label}
                  className={clsx(
                    css.segment,
                    viewTab.id === activeViewId && css.segmentActive,
                  )}
                  onClick={() => { selectView(viewTab.id) }}
                >
                  {Icon !== undefined && <Icon size={14} strokeWidth={1.75} />}
                  <span className={css.segmentLabel}>{viewTab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div className={css.utilities}>
        {renderSlot('conversation.session.header.utilities', {})}
      </div>
    </div>
  )
}

// SessionId is referenced through the breadcrumb contract; keep the import
// nominal for the emitted types.
export type { SessionId as _HeaderSessionId }
