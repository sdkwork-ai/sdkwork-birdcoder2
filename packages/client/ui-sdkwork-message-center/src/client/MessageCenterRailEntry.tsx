/**
 * The message-center rail shortcut: one icon cell in the rail's
 * `mode.rail.panel` seat, directly above Settings. Clicking it selects the
 * message center as the center column's main panel, so the workspace's left
 * column stays in place and the center switches to the message view. The cell
 * carries the unread badge, so the rail answers "anything new?" without
 * opening the page.
 */
import { IconMailReadOutlineRegular, IconMailUnreadOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { RailTooltip } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail's panel-shortcut seat declaration (mode.rail.panel)
// and the live panel selection hook.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { MESSAGE_CENTER_PANEL_ID } from './panel-id.ts'
import type { MessageCenterSnapshot } from './message-service.ts'
import css from './MessageCenterRailEntry.module.css'

/** Injected business face: the live unread fact and the page-selection gesture. */
export interface MessageCenterRailEntryInjected {
  /** Select the message center as the center column's main panel. */
  open: () => void
  hooks: {
    /** The message-center snapshot the badge counts unread from. */
    snapshot: HostObservable<MessageCenterSnapshot>
  }
}

/** Full component props: owner share + injected face + locale seat. */
export type MessageCenterRailEntryProps =
  PropsRuntime<'mode.rail.panel'>
  & InjectFace<MessageCenterRailEntryInjected>
  & PropsLocale<'messageCenter'>

/**
 * Render the message-center rail shortcut with its unread badge.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the rail shortcut button.
 */
export function MessageCenterRailEntry({ open, useSnapshot, usePanelInfo, t }: MessageCenterRailEntryProps) {
  const unread = useSnapshot(snapshot => snapshot.unreadCount)
  const active = usePanelInfo(info => info.activePanelId === MESSAGE_CENTER_PANEL_ID)
  const label = unread > 0 ? t('rail.unreadAria', { count: String(unread) }) : t('rail.aria')
  return (
    <RailTooltip label={t('rail.label')} delayMs={500}>
      <button
        type="button"
        className={active ? `${css.entry} ${css.active}` : css.entry}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={open}
      >
        {unread > 0
          ? <IconMailUnreadOutlineRegular size={22} aria-hidden="true" />
          : <IconMailReadOutlineRegular size={22} aria-hidden="true" />}
        {unread > 0 && <span className={css.badge} aria-hidden="true" />}
      </button>
    </RailTooltip>
  )
}
