/**
 * The Assets mode's rail entry: its 44px icon cell inside the rail's
 * keyed `mode.rail.entry` slot. The rail shell passes the live selection
 * state (active + setMode) as owner props; this entry knows its own mode id
 * through the registration's inject closure and swaps its glyph to the
 * filled weight while active.
 */
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail-entry slot contract (ui-sdkwork-app-modes' declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { AssetIcon, AssetIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business face: this entry's mode id (the keyed registration's key). */
export interface AssetsRailEntryInjected {
  /** The entry's own mode id. */
  mode: 'assets'
}

/** Full component props: runtime share (owner + standard) + injected mode + locale seat. */
export type AssetsRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & AssetsRailEntryInjected
  & PropsLocale<'assets'>

/**
 * Render the Assets rail entry cell.
 * @param props - composed slot props (owner share + injected mode + locale seat).
 * @returns the entry button element tree.
 */
export function AssetsRailEntry({ mode, active, setMode, t }: AssetsRailEntryProps) {
  const Icon = active ? AssetIconFilled : AssetIcon
  return (
    <Tooltip label={t('mode.assets')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.assets.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </Tooltip>
  )
}
