/**
 * The staged scene's skill tags: the strip docked BELOW the composer card
 * (occupied into ui-conversation's `conversation.composer.dock` seat, which
 * renders under the input card). The strip lists the staged scene's built-in
 * skills fully expanded — no overflow chrome, the row wraps; clicking a tag
 * lands the same `/name ` literal a '/'-menu pick lands, through the
 * session's public draft write in replace mode (the draft carries one
 * BirdCoder skill at a time).
 */
import { useCallback, useSyncExternalStore } from 'react'
import { IconSkillOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-conversation's SlotMap merge (the composer dock seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HeroScene, HeroSceneStore } from './hero-scene-store.ts'
import { SCENE_SKILLS } from './scene-skills.ts'
import css from './SceneSkillTags.module.css'

/**
 * The staged-skill token the strip owns: any BirdCoder skill reference in the
 * draft (a complete token with optional trailing space, or a trailing partial
 * the user is still typing). The draft carries one BirdCoder skill at a time
 * — the next tag pick replaces the previous one instead of accumulating.
 */
const STAGED_SKILL_TOKEN = /\/birdcoder-[a-z0-9-]+ ?/g
const TRAILING_PARTIAL_TOKEN = /\/birdcoder-[a-z0-9-]*$/

/** Injected business face: the staged-scene store owned by the registering plugin. */
export interface SceneSkillTagsInjected {
  /** The staged-scene store (shared with the hero switcher pills). */
  scene: HeroSceneStore
}

/** Full component props: runtime share (session standard) + injected face + locale seat. */
export type SceneSkillTagsProps =
  PropsRuntime<'conversation.composer.dock'>
  & SceneSkillTagsInjected
  & PropsLocale<'appMode'>

/**
 * Render the staged scene's skill-tag strip below the composer card.
 * @param props - composed slot props (runtime share + injected store + locale seat).
 * @returns the wrapped tag strip element tree.
 */
export function SceneSkillTags({ useInput, inputActions, scene, t }: SceneSkillTagsProps) {
  const input = useInput(s => s)
  const staged: HeroScene = useSyncExternalStore(scene.subscribe, scene.get)
  const insert = useCallback((skill: string) => {
    if (input === undefined) return
    // Replace-mode: strip every BirdCoder skill token (and a trailing partial)
    // from the draft, then land the new `/name ` — the '/'-menu pick's literal,
    // one BirdCoder skill per draft.
    const stripped = input.draft
      .replace(STAGED_SKILL_TOKEN, '')
      .replace(TRAILING_PARTIAL_TOKEN, '')
      .trimEnd()
    const glue = stripped === '' ? '' : ' '
    inputActions.setDraft(`${stripped}${glue}/${skill} `)
  }, [input, inputActions])

  return (
    <div className={css.strip} data-scene-skills={staged} role="group" aria-label={t('heroTag.group')}>
      {SCENE_SKILLS[staged].map(tag => (
        <button
          key={tag.skill}
          type="button"
          className={css.tag}
          title={`/${tag.skill}`}
          onClick={() => { insert(tag.skill) }}
        >
          <IconSkillOutline16 size={14} className={css.icon} />
          <span className={css.label}>{t(tag.labelKey)}</span>
        </button>
      ))}
    </div>
  )
}
