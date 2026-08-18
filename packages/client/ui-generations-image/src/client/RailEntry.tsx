import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import { ImageGenIcon, ImageGenIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business data for the image generation rail entry. */
export interface ImageGenerationsRailEntryInjected {
  /** The keyed mode id owned by this entry. */
  mode: 'image'
}

/** Composed props for the image generation rail entry. */
export type ImageGenerationsRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & ImageGenerationsRailEntryInjected
  & PropsLocale<'generationsImage'>

/**
 * Render the image generation rail button.
 * @param props - mode selection owner data, injected id, and locale seat.
 * @returns the rail button.
 */
export function ImageGenerationsRailEntry({ mode, active, setMode, t }: ImageGenerationsRailEntryProps) {
  const Icon = active ? ImageGenIconFilled : ImageGenIcon
  return (
    <Tooltip label={t('mode.image')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.image.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </Tooltip>
  )
}
