/**
 * Where a built-in skill belongs in the skill manager, and the alias it reads
 * as there.
 *
 * This is a projection, not a whitelist: the settings page renders whatever
 * the session's catalog serves. A name listed here gets a scenario group and a
 * localized alias (the same wording the new-session tag strip shows); a name
 * the catalog carries but this table does not — a hand-written project skill,
 * a `dsh-*` built-in, a user-level skill — falls through to the `other` group
 * and shows its own name. Skill names themselves are wire tokens and stay
 * verbatim, so the lookup key is the catalog name, never an alias.
 *
 * The groups mirror `ui-sdkwork-app-modes`' own scene strips (code / media /
 * document). They are duplicated rather than imported because a feature plugin
 * may not runtime-import another feature plugin's values; only the wording is
 * shared, and it is deliberately identical.
 */

import type { SkillsKey } from './locales.ts'

/** One scenario group of the skill manager. */
export type SkillGroupId = 'code' | 'media' | 'document'

/** One rendered group: a scenario group plus the bucket every unlisted name lands in. */
export type SkillGroupSlot = SkillGroupId | 'other'

/** Home group and alias of one built-in skill. */
export interface SkillScene {
  /** The group this skill is listed under. */
  readonly group: SkillGroupId
  /** The alias shown beside the skill's own name. */
  readonly labelKey: SkillsKey
}

/**
 * Built-in skill → home group and alias, in the strip's own display order.
 *
 * Typed as a partial map on purpose: the index signature is what makes
 * `SKILL_SCENES[someCatalogName]` honestly `SkillScene | undefined`, since the
 * catalog serves names this table does not list. Declaring it as a total
 * `Record<string, SkillScene>` would type away the fallback instead of
 * documenting it.
 */
export const SKILL_SCENES: Readonly<Partial<Record<string, SkillScene>>> = {
  'birdcoder-daily-dev': { group: 'code', labelKey: 'skill.dailyDev' },
  'birdcoder-web-dev': { group: 'code', labelKey: 'skill.webDev' },
  'birdcoder-html-web': { group: 'code', labelKey: 'skill.htmlWeb' },
  'birdcoder-react-web': { group: 'code', labelKey: 'skill.reactWeb' },
  'birdcoder-vue-web': { group: 'code', labelKey: 'skill.vueWeb' },
  'birdcoder-agent-app': { group: 'code', labelKey: 'skill.agentApp' },
  'birdcoder-skill-dev': { group: 'code', labelKey: 'skill.skillDev' },
  'birdcoder-cicd': { group: 'code', labelKey: 'skill.cicd' },
  'birdcoder-docs': { group: 'code', labelKey: 'skill.docs' },
  'birdcoder-miniprogram': { group: 'code', labelKey: 'skill.miniprogram' },
  'birdcoder-flutter-app': { group: 'code', labelKey: 'skill.flutterApp' },
  'birdcoder-uniapp': { group: 'code', labelKey: 'skill.uniapp' },
  'birdcoder-harmonyos': { group: 'code', labelKey: 'skill.harmonyos' },
  'birdcoder-ios-app': { group: 'code', labelKey: 'skill.iosApp' },
  'birdcoder-android-app': { group: 'code', labelKey: 'skill.androidApp' },
  'birdcoder-unity-app': { group: 'code', labelKey: 'skill.unityApp' },
  'birdcoder-dsh-plugin': { group: 'code', labelKey: 'skill.dshPlugin' },
  'birdcoder-workbuddy-plugin': { group: 'code', labelKey: 'skill.workbuddyPlugin' },
  'birdcoder-codex-plugin': { group: 'code', labelKey: 'skill.codexPlugin' },
  'birdcoder-workbuddy-app': { group: 'code', labelKey: 'skill.workbuddyApp' },
  'birdcoder-short-video': { group: 'media', labelKey: 'skill.shortVideo' },
  'birdcoder-video': { group: 'media', labelKey: 'skill.video' },
  'birdcoder-image': { group: 'media', labelKey: 'skill.image' },
  'birdcoder-music': { group: 'media', labelKey: 'skill.music' },
  'birdcoder-sound-effect': { group: 'media', labelKey: 'skill.soundEffect' },
  'birdcoder-tts': { group: 'media', labelKey: 'skill.tts' },
  'birdcoder-poster': { group: 'media', labelKey: 'skill.poster' },
  'birdcoder-lesson-plan': { group: 'document', labelKey: 'skill.lessonPlan' },
  'birdcoder-courseware': { group: 'document', labelKey: 'skill.courseware' },
  'birdcoder-business-plan': { group: 'document', labelKey: 'skill.businessPlan' },
  'birdcoder-product-ppt': { group: 'document', labelKey: 'skill.productPpt' },
  'birdcoder-ppt-design': { group: 'document', labelKey: 'skill.pptDesign' },
  'birdcoder-visual-poster': { group: 'document', labelKey: 'skill.visualPoster' },
  'birdcoder-marketing-poster': { group: 'document', labelKey: 'skill.marketingPoster' },
  'birdcoder-meeting-notes': { group: 'document', labelKey: 'skill.meetingNotes' },
}

/** Group order and heading key of each rendered slot, `other` last. */
export const SKILL_GROUP_ORDER: readonly { slot: SkillGroupSlot; labelKey: SkillsKey }[] = [
  { slot: 'code', labelKey: 'group.code' },
  { slot: 'media', labelKey: 'group.media' },
  { slot: 'document', labelKey: 'group.document' },
  { slot: 'other', labelKey: 'group.other' },
]

/**
 * Resolve the group a catalog name renders under.
 * @param name - the skill's catalog name.
 * @returns the scenario group slot, `other` for every unlisted name.
 */
export function skillGroupSlot(name: string): SkillGroupSlot {
  return SKILL_SCENES[name]?.group ?? 'other'
}
