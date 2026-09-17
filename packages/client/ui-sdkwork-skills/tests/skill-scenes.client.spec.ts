/**
 * Skill-manager projection spec: the table that decides which group a built-in
 * skill renders under and what alias it reads as has to stay answerable in both
 * dictionary languages, has to carry no copy the page can never show, and has
 * to resolve every name it does not know to the `other` bucket rather than to a
 * blank heading.
 *
 * The name SET itself is not asserted here: `pnpm run verify-builtin-scene-skills`
 * keeps this table and the composer's tag table in step with the packaged
 * skills, which is the only place that comparison belongs. What this spec owns
 * is everything downstream of the names — aliases, headings, and the fallback.
 */
import { describe, expect, it } from 'vitest'
import {
  SKILL_GROUP_ORDER, SKILL_SCENES, skillGroupSlot, type SkillGroupId, type SkillScene,
} from '../src/client/skill-scenes.ts'
import { en, zh } from '../src/client/locales.ts'

/** Every scene row, with the name it is filed under. */
const SCENES: readonly [string, SkillScene][] = Object.entries(SKILL_SCENES)
  .flatMap(([name, scene]) => (scene === undefined ? [] : [[name, scene] as [string, SkillScene]]))

/** The scenario groups, in the order the page renders them. */
const GROUPS = SKILL_GROUP_ORDER.map(entry => entry.slot)

describe('skill scene projection', () => {
  it('declares scenes at all', () => {
    expect(SCENES.length).toBeGreaterThan(0)
    expect(new Set(SCENES.map(([name]) => name)).size).toBe(SCENES.length)
  })

  it('names every skill with the grammar the registry validates candidates against', () => {
    for (const [name] of SCENES) expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it('carries a non-empty alias in both dictionary languages', () => {
    for (const [name, scene] of SCENES) {
      expect(zh[scene.labelKey], `${name} (zh)`).toBeTruthy()
      expect(en[scene.labelKey], `${name} (en)`).toBeTruthy()
    }
  })

  it('files every scene under a rendered group', () => {
    const rendered = new Set<SkillGroupId>(SKILL_GROUP_ORDER.map(entry => entry.slot)
      .filter((slot): slot is SkillGroupId => slot !== 'other'))
    for (const [name, scene] of SCENES) {
      expect(rendered, `${name} is filed under ${scene.group}`).toContain(scene.group)
    }
  })

  it('uses every alias the dictionaries define, so no copy is unreachable', () => {
    const used = new Set(SCENES.map(([, scene]) => scene.labelKey as string))
    const aliases = Object.keys(zh).filter(key => key.startsWith('skill.'))
    expect(aliases.filter(key => !used.has(key))).toEqual([])
  })

  it('orders each group once, headings last', () => {
    expect(GROUPS).toEqual(['code', 'media', 'document', 'other'])
    for (const entry of SKILL_GROUP_ORDER) {
      expect(zh[entry.labelKey], `${entry.slot} (zh)`).toBeTruthy()
      expect(en[entry.labelKey], `${entry.slot} (en)`).toBeTruthy()
    }
  })

  it('resolves a listed name to its group and anything else to the last slot', () => {
    for (const [name, scene] of SCENES) expect(skillGroupSlot(name)).toBe(scene.group)
    expect(skillGroupSlot('team-notes')).toBe('other')
    expect(skillGroupSlot('')).toBe('other')
    expect(GROUPS.at(-1)).toBe('other')
  })
})
