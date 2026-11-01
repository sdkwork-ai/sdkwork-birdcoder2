/**
 * Settings as the management surface for SkillHub-installed skills.
 *
 * The skill market registers an installed skill as a **runtime** skill
 * (`ctx.skills.register`, provider `skill-market`, source `skill-market`), which
 * is also the candidate that wins over the user-level filesystem copy of the
 * same directory (runtime rank 250 beats `$DSH_HOME/skills` rank 400). That
 * makes the Settings → 技能 page the place a market skill is turned on or off:
 * the page writes `disabledSkills`, and this package's Host half projects the
 * name back as a rank-0 suppression candidate visible to neither the model
 * catalog nor the `/` menu.
 *
 * The seam under test is exactly that projection against a real registry — not
 * a stand-in that would agree with itself. A regression here would let a
 * disabled market skill stay invocable, which is the one promise the Settings
 * switch makes.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry, { isModelInvocable, isUserInvocable } from '@deepseek-ai/dsh-skill'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply, type Config } from '../src/index.ts'
import {
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, PINNED_SCENE_TAGS_FIELD, UI_SKILLS_NAMESPACE,
} from '../src/skills-settings.ts'

/** Let the plugin's inject callbacks run against the mounted services. */
const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/**
 * Boot a real skill registry, a stand-in settings service, and this plugin's
 * Host half over a live `disabledSkills` reference.
 * @returns the composed context and the driver that replaces the suppressed set.
 */
async function bench(): Promise<{ ctx: Context; setDisabled: (names: readonly string[]) => void }> {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  ctx.provide('settings' as never, { configure: () => () => {} } as never)

  let disabled: string[] = []
  const config = {
    [DISABLED_SKILLS_FIELD]: { get: () => disabled },
    [HIDDEN_SCENE_TAGS_FIELD]: { get: () => [] },
    [PINNED_SCENE_TAGS_FIELD]: { get: () => [] },
  } as unknown as Config
  apply(ctx, config)
  await flush()
  return {
    ctx,
    setDisabled: (names) => {
      disabled = [...names]
      ctx.emit('settings/document-updated', UI_SKILLS_NAMESPACE as SettingsNamespace, 1)
    },
  }
}

describe('skill market management through settings', () => {
  it('suppresses a runtime-registered market skill from both catalogs', async () => {
    const { ctx, setDisabled } = await bench()
    const skills = ctx.get('skills')
    if (skills === undefined) throw new Error('skills service missing')
    const dispose = skills.register({
      name: 'market-pdf-skill',
      description: 'Installed from the SkillHub market.',
      source: 'skill-market',
      provider: 'skill-market',
      path: 'D:/dsh-home/skills/handle--pdf-skill/SKILL.md',
      resourceBase: { kind: 'directory', path: 'D:/dsh-home/skills/handle--pdf-skill' },
      content: '# PDF skill',
    })

    // The market's registration is what the catalog serves, and the provider is
    // the fact the Settings page groups and labels it by.
    const before = await skills.list()
    const row = before.find(skill => skill.name === 'market-pdf-skill')
    expect(row?.provider).toBe('skill-market')
    expect(isModelInvocable(row!)).toBe(true)
    expect(isUserInvocable(row!)).toBe(true)

    setDisabled(['market-pdf-skill'])
    const after = await skills.list()
    const suppressed = after.find(skill => skill.name === 'market-pdf-skill')
    // The suppression candidate wins the same-name merge, so the row survives
    // with both invocation policies turned off; the model catalog and the `/`
    // menu filter it at their own boundary.
    expect(suppressed?.provider).not.toBe('skill-market')
    expect(isModelInvocable(suppressed!)).toBe(false)
    expect(isUserInvocable(suppressed!)).toBe(false)
    expect(after.filter(skill => isModelInvocable(skill)).map(skill => skill.name))
      .not.toContain('market-pdf-skill')
    expect(after.filter(skill => isUserInvocable(skill)).map(skill => skill.name))
      .not.toContain('market-pdf-skill')

    // Turning the switch back on restores the registry's own registration: the
    // suppression is a projection, never a deletion.
    setDisabled([])
    const restored = await skills.list()
    expect(isModelInvocable(restored.find(skill => skill.name === 'market-pdf-skill')!)).toBe(true)
    dispose()
  })
})
