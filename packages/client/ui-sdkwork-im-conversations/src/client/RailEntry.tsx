/**
 * The chat mode's rail entry: its 44px icon cell inside the rail's keyed
 * `mode.rail.entry` slot, carrying the inbox unread badge. The rail shell
 * passes the live selection state (active + setMode) as owner props; the entry
 * reads the unread total from the `ctx.im` service through the inject hook
 * compartment and swaps its glyph to the filled weight while active.
 */
import clsx from 'clsx'
import { RailTooltip } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail-entry slot contract (ui-sdkwork-app-modes' declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type { ImSnapshot } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ChatIcon, ChatIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business face: this entry's mode id (the keyed registration's key). */
export interface ChatRailEntryInjected {
  /** The entry's own mode id. */
  mode: 'chat'
}

/** Full component props: runtime share + injected mode + IM snapshot hook + locale seat. */
export type ChatRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & ChatRailEntryInjected
  & { useIm: SnapshotSelectorHook<ImSnapshot> }
  & PropsLocale<'imConversations'>

/** Highest unread count the badge prints before switching to `99+`. */
const BADGE_MAX = 99

/**
 * Render the chat rail entry cell with the inbox unread badge.
 * @param props - composed slot props (owner share + injected mode + hook + locale seat).
 * @returns the entry button element tree.
 */
export function ChatRailEntry({ mode, active, setMode, useIm, t }: ChatRailEntryProps) {
  const unread = useIm(snapshot => snapshot.totalUnread ?? 0)
  const Icon = active ? ChatIconFilled : ChatIcon
  return (
    <RailTooltip label={t('mode.chat')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.chat.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
        {unread > 0 && (
          <span className={css.badge} aria-hidden="true">{unread > BADGE_MAX ? `${BADGE_MAX}+` : unread}</span>
        )}
      </button>
    </RailTooltip>
  )
}
