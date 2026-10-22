/**
 * The IM connector rail shortcut: one icon cell in the rail's
 * `mode.rail.panel` seat, directly above Settings. Clicking it switches the
 * frame to the IM connector's own mode page, which renders the IM management
 * panel as a full app surface (icon rail + content, no workspace sidebar). The
 * entry owns its button chrome, glyph, and copy; it paints the selected cell
 * while the host's active mode is its own target mode.
 */
import clsx from 'clsx'
import { RailTooltip } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/sdkwork-rail-tooltip'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail's panel-shortcut seat declaration (mode.rail.panel).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ImConnectorIcon } from './ImConnectorIcon.tsx'
import css from './ImConnectorEntry.module.css'

/** Injected business face: the mode page this shortcut opens. */
export interface ImConnectorEntryInjected {
  /** The app mode the shortcut switches to (the IM connector page). */
  mode: AppModeId
  /** Switch the frame to this shortcut's mode page. */
  selectMode: () => void
}

/** Full component props: runtime share (owner + standard) + injected target mode + locale seat. */
export type ImConnectorEntryProps =
  PropsRuntime<'mode.rail.panel'>
  & ImConnectorEntryInjected
  & PropsLocale<'imConnector'>

/**
 * Render the IM connector rail shortcut.
 * @param props - composed slot props (runtime share + injected target mode + locale seat).
 * @returns the rail shortcut button.
 */
export function ImConnectorEntry({ mode, activeMode, selectMode, t }: ImConnectorEntryProps) {
  const active = activeMode === mode
  return (
    <RailTooltip label={t('entry.label')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('entry.aria')}
        aria-current={active ? 'page' : undefined}
        onClick={() => { selectMode() }}
      >
        <ImConnectorIcon size={24} />
      </button>
    </RailTooltip>
  )
}
