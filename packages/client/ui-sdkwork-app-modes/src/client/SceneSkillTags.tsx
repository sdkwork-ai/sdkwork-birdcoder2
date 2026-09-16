/**
 * The staged scene's skill tags: the strip docked BELOW the composer card. The
 * strip serves the New Session creation flow only: it renders during the blank
 * phase and disappears the moment the conversation starts, so a live session
 * never shows the scene tags. The strip lists the staged scene's built-in
 * skills fully expanded — no overflow chrome, the row wraps; clicking a tag
 * lands the same `/name ` literal a '/'-menu pick lands, through the session's
 * public draft write in replace mode (the draft carries one BirdCoder skill at
 * a time).
 *
 * One strip, two seats — the below-card position exists in two mutually
 * exclusive states, and the shell mounts exactly one seat per state:
 *   - `conversation.composer.dock` (session scope, id `hero-scene-skills`) —
 *     every state that HAS a Session, the blank-session Hero included. The
 *     seated variant reads the session standard kit and writes live drafts.
 *   - `conversation.hero.dock` (root scope, id `hero-scene-skills-cold`) — the
 *     cold start, before a Workspace is picked: no Session exists, so the
 *     session-scoped dock cannot render at all and the composer bar is inert.
 *     With no draft to write to, this variant renders the same tags disabled —
 *     a faithful preview of the staged scene instead of a dead affordance.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { IconSkillOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Runtime: the phase helper deciding whether the creation flow is still live.
import { conversationPhase } from '@deepseek-ai/dsh-client-ui-conversation/client'
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

/** The locale seat both variants read (one namespace, one key set). */
type SceneTagTranslate = PropsLocale<'appMode'>['t']

/** Full component props: runtime share (session standard) + injected face + locale seat. */
export type SceneSkillTagsProps =
  PropsRuntime<'conversation.composer.dock'>
  & SceneSkillTagsInjected
  & PropsLocale<'appMode'>

/**
 * Full component props of the session-less strip: the root-scope seat's
 * runtime share + the same injected store + the same locale seat.
 */
export type HeroSceneSkillTagsProps =
  PropsRuntime<'conversation.hero.dock'>
  & SceneSkillTagsInjected
  & PropsLocale<'appMode'>

/**
 * Render one staged scene's skills as the wrapped tag row.
 * @param props - the staged scene, the locale seat, and the pick handler.
 * @returns the tag strip element tree.
 */
function SkillTagStrip(
  { staged, t, onPick }: { staged: HeroScene; t: SceneTagTranslate; onPick?: (skill: string) => void },
) {
  // A local const so the absent-handler narrowing survives into the closure.
  const pick = onPick
  return (
    <div className={css.strip} data-scene-skills={staged} role="group" aria-label={t('heroTag.group')}>
      {SCENE_SKILLS[staged].map(tag => (
        <button
          key={tag.skill}
          type="button"
          className={css.tag}
          title={`/${tag.skill}`}
          disabled={pick === undefined}
          onClick={pick === undefined ? undefined : () => { pick(tag.skill) }}
        >
          <IconSkillOutline16 size={14} className={css.icon} />
          <span className={css.label}>{t(tag.labelKey)}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Render the staged scene's skill-tag strip below the composer card.
 * @param props - composed slot props (runtime share + injected store + locale seat).
 * @returns the wrapped tag strip element tree.
 */
export function SceneSkillTags({ useSession, useConversation, useInput, inputActions, scene, t }: SceneSkillTagsProps) {
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const input = useInput(s => s)
  // oxlint-disable-next-line typescript/unbound-method -- arrow-closure store face; binding would churn the subscribe identity.
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

  // New-Session-only: the strip disappears once the first message lands or
  // the session otherwise engages (the composer dock also renders for live
  // conversations, where the scene tags have no meaning).
  if (conversationPhase(session, conversation) !== 'blank') return null

  return <SkillTagStrip staged={staged} t={t} onPick={insert} />
}

/**
 * Render the same strip for the cold-start Hero, which has no Session (and so
 * no draft) yet. The shell mounts this seat only in that state, so the
 * component reads nothing but the staged scene; the tags render disabled.
 * @param props - composed slot props (root runtime share + injected store + locale seat).
 * @returns the tag strip element tree.
 */
export function HeroSceneSkillTags({ scene, t }: HeroSceneSkillTagsProps) {
  // oxlint-disable-next-line typescript/unbound-method -- same store face as above; unbound keeps the subscribe identity stable.
  const staged: HeroScene = useSyncExternalStore(scene.subscribe, scene.get)
  return <SkillTagStrip staged={staged} t={t} />
}
