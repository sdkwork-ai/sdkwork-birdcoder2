/**
 * The message-center rail shortcut: one icon cell in the rail's
 * `mode.rail.panel` seat, directly above Settings. Clicking it refreshes the
 * notification page and opens the message center over the workspace. The cell
 * carries the unread badge, so the rail answers "anything new?" without opening
 * the center.
 */
import { IconMailReadOutlineRegular, IconMailUnreadOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { RailTooltip } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
  PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail's panel-shortcut seat declaration (mode.rail.panel).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type { createMessageCenterUiStore } from './message-ui-store.ts'
import type { MessageCenterSnapshot } from './message-service.ts'
import css from './MessageCenterRailEntry.module.css'

/** Injected business face: the live unread fact and the refresh gesture. */
export interface MessageCenterRailEntryInjected {
  /** Re-read the notification page before the center opens. */
  refresh: () => void
  hooks: {
    /** The message-center snapshot the badge counts unread from. */
    snapshot: HostObservable<MessageCenterSnapshot>
  }
}

/** Full component props: owner share + shared store + injected face + locale seat. */
export type MessageCenterRailEntryProps =
  PropsRuntime<'mode.rail.panel'>
  & PropsStore<ReturnType<typeof createMessageCenterUiStore>>
  & InjectFace<MessageCenterRailEntryInjected>
  & PropsLocale<'messageCenter'>

/**
 * Render the message-center rail shortcut with its unread badge.
 * @param props - composed slot props (owner share + store + injected face + locale seat).
 * @returns the rail shortcut button.
 */
export function MessageCenterRailEntry({ actions, refresh, useSnapshot, t }: MessageCenterRailEntryProps) {
  const unread = useSnapshot(snapshot => snapshot.unreadCount)
  const label = unread > 0 ? t('rail.unreadAria', { count: String(unread) }) : t('rail.aria')
  return (
    <RailTooltip label={t('rail.label')} delayMs={500}>
      <button
        type="button"
        className={css.entry}
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => {
          refresh()
          actions.openDialog()
        }}
      >
        {unread > 0
          ? <IconMailUnreadOutlineRegular size={22} aria-hidden="true" />
          : <IconMailReadOutlineRegular size={22} aria-hidden="true" />}
        {unread > 0 && <span className={css.badge} aria-hidden="true" />}
      </button>
    </RailTooltip>
  )
}
