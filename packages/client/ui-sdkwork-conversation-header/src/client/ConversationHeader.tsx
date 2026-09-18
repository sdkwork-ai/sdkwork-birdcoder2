/*
 * SDKWork conversation header surface: the full body of the conversation
 * Session header in ONE row — breadcrumb cluster + action strip on the left,
 * an icon+label segmented control (replacing the former full-width View tabs
 * strip) centered in the row, and the utility cluster on the right. The
 * upstream header entry stays mounted as the shell (blank-session hiding,
 * bottom hairline) and renders its own two-row body as the fallback.
 *
 * The far-right corner seat is NOT rendered here. It belongs to the upstream
 * shell, which keeps it mounted through every phase including the blank
 * session, where this body does not render at all — a copy here would both
 * double the control in live sessions and lose it in the hero. The shell's
 * corner sits beside this body in the header row.
 *
 * All reactivity rides the owner share handed down by the upstream header
 * entry; this component is a pure function of props.
 */
import clsx from 'clsx'
import { MessageSquare, Route } from 'lucide-react'
import type {
  ConversationHeaderBreadcrumb, ConversationHeaderSurfaceSlotProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { NS } from './locales.ts'
import css from './ConversationHeader.module.css'

/** Full component props: owner share (parent reactivity) + this plugin's locale. */
export type SdkworkConversationHeaderProps =
  ConversationHeaderSurfaceSlotProps & PropsLocale<typeof NS>

/**
 * View-id → glyph table for the segmented control.
 *
 * Indexed open, because a registered View id is not known here: an id outside
 * this table renders its label alone, which the `undefined` in the value type
 * is what states.
 */
const VIEW_ICONS: Readonly<Record<string, typeof MessageSquare | undefined>> = {
  chat: MessageSquare,
  trajectory: Route,
}

/**
 * Render the SDKWork conversation header body.
 * @param props - owner share handed down by the upstream header entry plus the locale seat.
 * @returns the single-row header body: breadcrumbs | segmented view control | actions/utilities.
 */
export function SdkworkConversationHeader({
  sessionId, renderSlot, open, selectView, ancestry, views, activeViewId, t,
}: SdkworkConversationHeaderProps) {
  return (
    <div className={css.titleRow} data-sdkwork-header-body="">
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
        <div className={css.headerActions}>
          {renderSlot('conversation.session.header.actions', {})}
        </div>
      </div>
      {views.length > 1 && (
        <div className={css.center}>
          <div className={css.segments} role="tablist" aria-label={t('header.viewsAria')}>
            {views.map((viewTab) => {
              const Icon = VIEW_ICONS[viewTab.id]
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
      <div className={css.endCluster}>
        <div className={css.utilities}>
          {renderSlot('conversation.session.header.utilities', {})}
        </div>
      </div>
    </div>
  )
}

// SessionId is referenced through the breadcrumb contract; keep the import
// nominal for the emitted types.
export type { SessionId as _HeaderSessionId }
