/**
 * Skill-manager preferences stored in the Host user-settings document. The
 * durable section is registered by this package's Host half and bound by its
 * browser half, so the two sides can never disagree about the shape.
 *
 * All three fields are name lists rather than a per-skill record: the skill
 * catalog itself lives on disk (`.agents/skills/*`), and a name absent from
 * every list is a skill the user never touched — which is exactly the state a
 * reset returns to. The Host applies `disabledSkills` as real catalog
 * suppression (see `src/index.ts`), so a disabled skill disappears from the `/`
 * menu and from the model-facing catalog; the two strip fields only change what
 * is *suggested*:
 *
 * - `hiddenSceneTags` removes the skill's pill from the new-session tag strip
 *   even though a scene table would otherwise place it there.
 * - `pinnedSceneTags` adds the skill's pill to the strip even though no scene
 *   table places it there.
 *
 * The two strip lists are deliberately disjoint in intent, not enforced as
 * disjoint in storage: a name that appears in both is a contradiction the
 * browser half resolves by letting `hiddenSceneTags` win, because "the user
 * turned this off" is the more recent and more specific statement.
 *
 * Why a third list instead of an "unhidden" list: a scene table entry is a
 * product decision made at build time, so "show it" must be expressible for a
 * skill the tables never knew about — a project skill, a `dsh-*` built-in, a
 * user-level skill. A subtraction-only model can never add those.
 *
 * `showSceneTags` is the strip's master switch, a different question from
 * either list: the lists choose *which* skills the strip suggests, while this
 * flag decides whether the strip renders at all. It defaults to true so a
 * document written before the field existed keeps today's behavior, and it is
 * deliberately independent of the lists — turning the strip off must not
 * rewrite per-skill choices the user would expect back when they turn it on.
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the skill-manager plugin. */
export const UI_SKILLS_NAMESPACE = 'ui-sdkwork-skills'

/** Field carrying the suppressed skill names in the ui-sdkwork-skills section. */
export const DISABLED_SKILLS_FIELD = 'disabledSkills'

/** Field carrying the skill names hidden from the new-session tag strip. */
export const HIDDEN_SCENE_TAGS_FIELD = 'hiddenSceneTags'

/** Field carrying the skill names explicitly added to the new-session tag strip. */
export const PINNED_SCENE_TAGS_FIELD = 'pinnedSceneTags'

/** Field carrying the strip's master switch: whether the tag strip renders at all. */
export const SHOW_SCENE_TAGS_FIELD = 'showSceneTags'

/** Durable skill-manager section shared by the Host schema and the browser scope. */
export interface UiSkillsSettings {
  /** Skill names suppressed from every catalog this Host serves. */
  disabledSkills: string[]
  /** Skill names kept out of the new-session tag strip while staying available. */
  hiddenSceneTags: string[]
  /** Skill names added to the new-session tag strip beyond the staged scene's own table. */
  pinnedSceneTags: string[]
  /** Whether the new-session tag strip renders at all. */
  showSceneTags: boolean
}

/** Durable skill-manager fields, shared by the Host Config and the browser scope. */
export const UiSkillsSettingsFields = {
  [DISABLED_SKILLS_FIELD]: z.array(z.string()).default([]),
  [HIDDEN_SCENE_TAGS_FIELD]: z.array(z.string()).default([]),
  [PINNED_SCENE_TAGS_FIELD]: z.array(z.string()).default([]),
  [SHOW_SCENE_TAGS_FIELD]: z.boolean().default(true),
}

/** Durable skill-manager schema; also the wire envelope the browser scope validates against. */
export const UiSkillsSettingsSchema: z<UiSkillsSettings> = z.object(UiSkillsSettingsFields)
