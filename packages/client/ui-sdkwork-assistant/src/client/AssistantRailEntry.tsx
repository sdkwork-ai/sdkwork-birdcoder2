/**
 * The assistant rail cell: one icon cell in the mode group, directly below
 * Home. Clicking it selects the linked persona-bot layer's main panel, which
 * takes the center column while the frame's mode stays `code`; the selection
 * therefore comes from `usePanelInfo` — the panel is the selected surface —
 * rather than from the owner's `active`, which the rail derives from the mode.
 * A composition without that plugin registers no cell (see the apply body), so
 * this component only ever renders against a live panel.
 */
import clsx from 'clsx'
import { RailTooltip } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail's `mode.rail.entry` contract and the AppModeId
// vocabulary this cell's key belongs to.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { AssistantIcon } from './AssistantIcon.tsx'
import { ASSISTANT_PANEL_ID } from './surface.ts'
import css from './AssistantRailEntry.module.css'

/** Injected business face: the surface this cell opens. */
export interface AssistantRailEntryInjected {
  /** Select the assistant main panel (the linked layer's whole interface). */
  open: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type AssistantRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & AssistantRailEntryInjected
  & PropsLocale<'assistant'>

/**
 * Render the assistant rail cell.
 * @param props - composed slot props (runtime share + injected open action + locale seat).
 * @returns the rail cell button.
 */
export function AssistantRailEntry({ open, usePanelInfo, t }: AssistantRailEntryProps) {
  const active = usePanelInfo(info => info.activePanelId === ASSISTANT_PANEL_ID)
  return (
    <RailTooltip label={t('entry.label')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('entry.aria')}
        aria-pressed={active}
        onClick={() => { open() }}
      >
        <AssistantIcon size={24} filled={active} />
      </button>
    </RailTooltip>
  )
}
