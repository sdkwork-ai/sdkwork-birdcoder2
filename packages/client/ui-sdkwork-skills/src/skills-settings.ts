/**
 * Skill-manager preferences stored in the Host user-settings document. The
 * durable section is registered by this package's Host half and bound by its
 * browser half, so the two sides can never disagree about the shape.
 *
 * Both fields are name lists rather than a per-skill record: the skill catalog
 * itself lives on disk (`.agents/skills/*`), and a name absent from both lists
 * is a skill the user never touched — which is exactly the state a reset
 * returns to. The Host applies `disabledSkills` as real catalog suppression
 * (see `src/index.ts`), so a disabled skill disappears from the `/` menu and
 * from the model-facing catalog; `hiddenSceneTags` only removes its pill from
 * the new-session tag strip, leaving the skill fully available.
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the skill-manager plugin. */
export const UI_SKILLS_NAMESPACE = 'ui-sdkwork-skills'

/** Field carrying the suppressed skill names in the ui-sdkwork-skills section. */
export const DISABLED_SKILLS_FIELD = 'disabledSkills'

/** Field carrying the skill names hidden from the new-session tag strip. */
export const HIDDEN_SCENE_TAGS_FIELD = 'hiddenSceneTags'

/** Durable skill-manager section shared by the Host schema and the browser scope. */
export interface UiSkillsSettings {
  /** Skill names suppressed from every catalog this Host serves. */
  disabledSkills: string[]
  /** Skill names kept out of the new-session tag strip while staying available. */
  hiddenSceneTags: string[]
}

/** Durable skill-manager schema; also the wire envelope the browser scope validates against. */
export const UiSkillsSettingsSchema: z<UiSkillsSettings> = z.object({
  [DISABLED_SKILLS_FIELD]: z.array(z.string()).default([]),
  [HIDDEN_SCENE_TAGS_FIELD]: z.array(z.string()).default([]),
})
