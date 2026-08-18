import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import { AssetsGenIcon, AssetsGenIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business data for the generated-assets rail entry. */
export interface AssetsGenerationsRailEntryInjected {
  /** The keyed mode id owned by this entry. */
  mode: 'assets'
}

/** Composed props for the generated-assets rail entry. */
export type AssetsGenerationsRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & AssetsGenerationsRailEntryInjected
  & PropsLocale<'generationsAssets'>

/**
 * Render the assets rail button; swaps to the filled glyph while active.
 * @param props - mode selection owner data, injected id, and locale seat.
 * @returns the rail button.
 */
export function AssetsGenerationsRailEntry({ mode, active, setMode, t }: AssetsGenerationsRailEntryProps) {
  const Icon = active ? AssetsGenIconFilled : AssetsGenIcon
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
