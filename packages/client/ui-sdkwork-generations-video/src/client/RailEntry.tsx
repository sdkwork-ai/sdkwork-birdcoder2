import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { VideoGenIcon, VideoGenIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business data for the video generation rail entry. */
export interface VideoGenerationsRailEntryInjected {
  /** The keyed mode id owned by this entry. */
  mode: 'video'
}

/** Composed props for the video generation rail entry. */
export type VideoGenerationsRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & VideoGenerationsRailEntryInjected
  & PropsLocale<'generationsVideo'>

/**
 * Render the video generation rail button.
 * @param props - mode selection owner data, injected id, and locale seat.
 * @returns the rail button.
 */
export function VideoGenerationsRailEntry({ mode, active, setMode, t }: VideoGenerationsRailEntryProps) {
  const Icon = active ? VideoGenIconFilled : VideoGenIcon
  return (
    <Tooltip label={t('mode.video')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.video.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </Tooltip>
  )
}
