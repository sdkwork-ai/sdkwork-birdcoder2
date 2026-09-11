// The packaged scene-skill root is the fork's contract with the composer tag
// strip: `ui-sdkwork-app-modes` inserts `/birdcoder-…` tokens, and only a
// catalog entry makes one a decorated, openable reference. These assertions
// cover the discovery shape a user actually depends on (name, invocation,
// absolute SKILL.md path) plus the two ways the shipped set can rot: a skill
// dropped from the package, and a packaged copy drifting from its authoring
// source under `.agents/skills`.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as BuiltinSkills from '@deepseek-ai/dsh-sdkwork-builtin-skills'

/** Package root, resolved from this spec's own location. */
const PACKAGE_ROOT = new URL('../', import.meta.url)

/** Authoring home of the same skills; the packaged copies must match it. */
const AUTHORING_SKILLS_DIR = new URL('../../../../.agents/skills/', import.meta.url)

/**
 * Every skill the composer tag strip can insert. Sorted by code point, the
 * order `ctx.skills.list()` guarantees.
 */
const SHIPPED_SKILLS = [
  'birdcoder-agent-app',
  'birdcoder-android-app',
  'birdcoder-business-plan',
  'birdcoder-cicd',
  'birdcoder-codex-plugin',
  'birdcoder-courseware',
  'birdcoder-daily-dev',
  'birdcoder-docs',
  'birdcoder-dsh-plugin',
  'birdcoder-flutter-app',
  'birdcoder-harmonyos',
  'birdcoder-html-web',
  'birdcoder-image',
  'birdcoder-ios-app',
  'birdcoder-lesson-plan',
  'birdcoder-marketing-poster',
  'birdcoder-meeting-notes',
  'birdcoder-miniprogram',
  'birdcoder-music',
  'birdcoder-poster',
  'birdcoder-ppt-design',
  'birdcoder-product-ppt',
  'birdcoder-react-web',
  'birdcoder-short-video',
  'birdcoder-skill-dev',
  'birdcoder-sound-effect',
  'birdcoder-tts',
  'birdcoder-uniapp',
  'birdcoder-unity-app',
  'birdcoder-video',
  'birdcoder-visual-poster',
  'birdcoder-vue-web',
  'birdcoder-web-dev',
  'birdcoder-workbuddy-app',
  'birdcoder-workbuddy-plugin',
] as const

describe('dsh-sdkwork-builtin-skills', () => {
  it('registers every shipped scene skill at the bundled rank', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(BuiltinSkills)

    const skills = await ctx.skills.list()
    expect(skills.map(skill => skill.name)).toEqual([...SHIPPED_SKILLS])
    for (const skill of skills) {
      expect(skill.source).toBe('bundled')
      expect(skill.provider).toBe(BuiltinSkills.PROVIDER_NAME)
      expect(skill.invocation).toEqual({ modelInvocable: true, userInvocable: true })
      // The absolute instruction path is what `skills/list` forwards for the
      // composer's reference preview, so it is part of the shipped contract.
      expect(skill.path).toBe(join(BuiltinSkills.BUNDLED_SKILLS_DIR, skill.name, 'SKILL.md'))
      expect(skill.resourceBase).toEqual({
        kind: 'directory',
        path: join(BuiltinSkills.BUNDLED_SKILLS_DIR, skill.name),
      })
      expect(skill.description.length).toBeGreaterThan(0)
    }

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('loads a packaged body through the registry', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(BuiltinSkills)

    const loaded = await ctx.skills.get('birdcoder-video')
    expect(loaded?.content).toContain('# Video Generation')
    expect(loaded?.path).toBe(join(BuiltinSkills.BUNDLED_SKILLS_DIR, 'birdcoder-video', 'SKILL.md'))

    await fiber.dispose()
  })

  it('keeps the packaged bodies identical to their .agents/skills sources', async () => {
    for (const name of SHIPPED_SKILLS) {
      const shipped = await readFile(new URL(`assets/skills/${name}/SKILL.md`, PACKAGE_ROOT), 'utf8')
      const authoring = await readFile(new URL(`${name}/SKILL.md`, AUTHORING_SKILLS_DIR), 'utf8')
      expect(shipped, `${name} drifted from .agents/skills`).toBe(authoring)
    }
  })
})
