import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import { AppStoreIcon, AppStoreIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business data for the App Store rail entry. */
export interface AppStoreRailEntryInjected {
  /** The keyed mode id owned by this entry. */
  mode: 'appstore'
}

/** Composed props for the App Store rail entry. */
export type AppStoreRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & AppStoreRailEntryInjected
  & PropsLocale<'appstore'>

/**
 * Render the App Store rail button.
 * @param props - mode selection owner data, injected id, and locale seat.
 * @returns the rail button.
 */
export function AppStoreRailEntry({ mode, active, setMode, t }: AppStoreRailEntryProps) {
  const Icon = active ? AppStoreIconFilled : AppStoreIcon
  return (
    <Tooltip label={t('mode.appstore')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.appstore.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </Tooltip>
  )
}
