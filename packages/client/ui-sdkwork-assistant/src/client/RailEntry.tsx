/**
 * The assistant mode's rail entry: its 44px icon cell inside the rail's keyed
 * `mode.rail.entry` slot, directly below the Home entry in the shipped order.
 * The rail shell passes the live selection state (active + setMode) as owner
 * props; the entry knows its own mode id through the registration's inject
 * closure and swaps its glyph to the filled weight while active.
 */
import clsx from 'clsx'
import { RailTooltip } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail-entry slot contract (ui-sdkwork-app-modes' declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { AssistantIcon, AssistantIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business face: this entry's mode id (the keyed registration's key). */
export interface AssistantRailEntryInjected {
  /** The entry's own mode id. */
  mode: AppModeId
}

/** Full component props: runtime share (owner + standard) + injected mode + locale seat. */
export type AssistantRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & AssistantRailEntryInjected
  & PropsLocale<'assistant'>

/**
 * Render the assistant rail entry cell.
 * @param props - composed slot props (owner share + injected mode + locale seat).
 * @returns the entry button element tree.
 */
export function AssistantRailEntry({ mode, active, setMode, t }: AssistantRailEntryProps) {
  const Icon = active ? AssistantIconFilled : AssistantIcon
  return (
    <RailTooltip label={t('mode.assistant')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.assistant.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </RailTooltip>
  )
}
