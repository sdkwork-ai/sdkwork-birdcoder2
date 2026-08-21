/**
 * One keyed mode-rail entry: the 44px icon cell for a single mode, rendered
 * inside the rail's keyed `mode.rail.entry` slot. The rail shell passes the
 * live selection state (active + setMode) as owner props; the entry knows its
 * own mode id through the registration's inject closure and swaps its glyph
 * to the filled weight while active.
 */
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sdkwork-app-modes' SlotMap merge ('mode.rail.entry' owner share)
// and ui-layout's AppModeId vocabulary.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type { BaseAppModeId } from './base-modes.ts'
import { MODE_ICONS, MODE_ICONS_FILLED } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface RailEntryInjected {
  /** The entry's own mode id (the keyed registration's key). */
  mode: BaseAppModeId
}

/** Full component props: runtime share (owner + standard) + injected mode + locale seat. */
export type RailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & RailEntryInjected
  & PropsLocale<'appMode'>

/**
 * Render one mode-rail entry cell.
 * @param props - composed slot props (owner share + injected mode + locale seat).
 * @returns the entry button element tree.
 */
export function RailEntry({ mode, active, setMode, t }: RailEntryProps) {
  const Icon = active ? MODE_ICONS_FILLED[mode] : MODE_ICONS[mode]
  return (
    <Tooltip label={t(`mode.${mode}`)} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t(`mode.${mode}.label`)}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </Tooltip>
  )
}
