/**
 * The new-session hero's scene switcher: the connected segmented pill bar
 * under the headline (occupied into ui-conversation's
 * `conversation.hero.modeSwitch` seat). Clicking a pill stages the scene and
 * keeps the conversation on screen — the frame navigates to the staged
 * scene's mode page only when the session's first message is submitted (the
 * owning plugin's submission observer). Staging is the pills' only effect: a
 * scene whose destination surface needs a signed-in session is asked there,
 * never from the Code surface. The hero renders only inside the code surface,
 * so Code is the resting staging.
 */
import { useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { FC } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-conversation's SlotMap merge (the hero mode-switch seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CodeIcon, CodeIconFilled, DocumentIcon, DocumentIconFilled, VideoIcon, VideoIconFilled } from './icons.tsx'
import type { ModeIconProps } from './icons.tsx'
import type { HeroSceneStore } from './hero-scene-store.ts'
import css from './HeroModeSwitch.module.css'

/** The scene pills, in display order: Code here, Video and Document as the
 * creation surfaces staged from the hero. */
export const HERO_SWITCH_MODES: readonly AppModeScene[] = ['code', 'video', 'document']

/** Alias keeping the pill table honest about the scene vocabulary it stages. */
type AppModeScene = import('./hero-scene-store.ts').HeroScene

/** Pill glyphs, outline weight (idle pills). */
const HERO_SWITCH_ICONS: Record<AppModeScene, FC<ModeIconProps>> = {
  code: CodeIcon,
  video: VideoIcon,
  document: DocumentIcon,
}

/** Pill glyphs, filled weight (the staged pill). */
const HERO_SWITCH_ICONS_FILLED: Record<AppModeScene, FC<ModeIconProps>> = {
  code: CodeIconFilled,
  video: VideoIconFilled,
  document: DocumentIconFilled,
}

/** Injected business face: the staging store owned by the registering plugin. */
export interface HeroModeSwitchInjected {
  /** The staged-scene store (shared with the skill-tag strip below the composer). */
  scene: HeroSceneStore
}

/** Full component props: runtime share (empty owner) + injected face + locale seat. */
export type HeroModeSwitchProps =
  PropsRuntime<'conversation.hero.modeSwitch'>
  & HeroModeSwitchInjected
  & PropsLocale<'appMode'>

/**
 * Render the hero scene-switcher pill group.
 * @param props - composed slot props (runtime share + injected face + locale seat).
 * @returns the pill group element tree.
 */
export function HeroModeSwitch({ scene, t }: HeroModeSwitchProps) {
  const staged = useSyncExternalStore(scene.subscribe, scene.get)

  return (
    <div className={css.group} data-scene-pills="" role="group" aria-label={t('heroSwitch.group')} data-hero-mode-switch="">
      {HERO_SWITCH_MODES.map((mode) => {
        const active = mode === staged
        const Icon = active ? HERO_SWITCH_ICONS_FILLED[mode] : HERO_SWITCH_ICONS[mode]
        return (
          <button
            key={mode}
            type="button"
            className={clsx(css.pill, active && css.active)}
            aria-pressed={active}
            onClick={() => { scene.set(mode) }}
          >
            <Icon size={16} className={css.icon} />
            <span className={css.label}>{t(`heroSwitch.${mode}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
