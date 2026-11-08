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
import { SKILL_MARKET_PROVIDER } from './skills-store.ts'

/** One scenario group of the skill manager. */
export type SkillGroupId = 'code' | 'media' | 'document'

/**
 * One rendered group: a scenario group, the SkillHub market group, plus the
 * bucket every unlisted name lands in.
 */
export type SkillGroupSlot = SkillGroupId | 'market' | 'other'

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

/** Label key of every group tab, total over the rendered slots. */
export const SKILL_GROUP_LABELS: Readonly<Record<SkillGroupSlot, SkillsKey>> = {
  market: 'group.market',
  code: 'group.code',
  media: 'group.media',
  document: 'group.document',
  other: 'group.other',
}

/** Render order of the group tabs, `other` last. */
const SKILL_GROUP_SLOTS = ['market', 'code', 'media', 'document', 'other'] as const satisfies readonly SkillGroupSlot[]

/**
 * The group tabs in display order, each with its label key.
 *
 * The market leads: a skill installed from SkillHub is the one this page's
 * reader just chose to add, so it reads before the packaged scenes rather than
 * being buried among the user's hand-written skills.
 */
export const SKILL_GROUP_ORDER: readonly { slot: SkillGroupSlot; labelKey: SkillsKey }[] =
  SKILL_GROUP_SLOTS.map(slot => ({ slot, labelKey: SKILL_GROUP_LABELS[slot] }))

/**
 * Resolve the group a catalog name renders under.
 * @param name - the skill's catalog name.
 * @returns the scenario group slot, `other` for every unlisted name.
 */
export function skillGroupSlot(name: string): SkillGroupSlot {
  return SKILL_SCENES[name]?.group ?? 'other'
}

/**
 * Resolve the group a catalog row renders under.
 *
 * Provider first, name second: a market-installed skill is grouped by where it
 * came from even when its name happens to collide with a scene table entry,
 * because "installed from SkillHub" is the fact that governs how it is managed
 * (the market owns the directory; this page owns the suppression).
 * @param row - the catalog row (name plus the winning provider).
 * @returns the rendered group slot.
 */
export function skillRowSlot(row: { readonly name: string; readonly provider: string }): SkillGroupSlot {
  if (row.provider === SKILL_MARKET_PROVIDER) return 'market'
  return skillGroupSlot(row.name)
}
