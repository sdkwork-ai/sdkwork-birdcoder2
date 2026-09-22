/**
 * ui-sdkwork-skills Host half spec: the live settings section this plugin
 * declares as its own `Config`, and the suppression provider that turns a
 * disabled skill into a skill the catalogs no longer serve.
 *
 * Driven directly against a real Cordis context with a stand-in `settings`
 * service, because what is under test is the seam between the plugin's own
 * preferences and the skill catalogs: the rank that has to beat every
 * filesystem root, the invocation policy that has to hide the name from both
 * the user catalog and the model catalog, the per-call read that makes a commit
 * visible, and the invalidation that drops the registry's own catalog cache.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type {
  SkillCandidate, SkillProvider, SkillProviderControl, SkillProviderObservation,
} from '@deepseek-ai/dsh-skill'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply, type Config } from '../src/index.ts'
import {
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, UI_SKILLS_NAMESPACE,
} from '../src/skills-settings.ts'

/** What the bench captured from one `apply()`. */
interface Bench {
  ctx: Context
  provider: SkillProvider | undefined
  invalidate: ReturnType<typeof vi.fn>
  /** The page policy the plugin registered for its own entry. */
  configure: ReturnType<typeof vi.fn>
  /** Replace the names the live `disabledSkills` reference resolves. */
  setDisabledSkills: (names: unknown) => void
  /** Announce the settings commit the Host publishes for one entry. */
  commit: (ns: string) => void
}

/**
 * Boot the Host half over a stand-in settings service and a stand-in skill
 * registry.
 *
 * The returned object is filled in by the plugin's own registration callbacks,
 * so read `provider` off it after `flush()` — destructuring it up front would
 * capture the placeholder the callback later replaces.
 * @param options.disabled - the suppressed names the section starts with.
 * @param options.withSkills - whether a skill registry is composed at all.
 * @returns the captured registrations and the drivers that move them.
 */
function bench(options: { disabled?: readonly unknown[]; withSkills?: boolean } = {}): Bench {
  const ctx = new Context()
  let disabled: unknown = [...(options.disabled ?? ['birdcoder-tts'])]
  const invalidate = vi.fn()
  const configure = vi.fn(() => () => {})

  ctx.provide('settings' as never, { configure } as never)
  if (options.withSkills !== false) {
    ctx.provide('skills' as never, {
      registerProvider: (create: (control: SkillProviderControl) => SkillProvider) => {
        captured.provider = create({
          signal: new AbortController().signal,
          invalidate,
        })
        return () => {}
      },
    } as never)
  }

  const captured: Bench = {
    ctx,
    provider: undefined,
    invalidate,
    configure,
    setDisabledSkills: (next) => { disabled = next },
    commit: (ns) => { ctx.emit('settings/document-updated', ns as SettingsNamespace, 1) },
  }
  // The section is this plugin's own Config, so the only live surface the Host
  // half touches is the volatile field reference it reads per call.
  const config = {
    [DISABLED_SKILLS_FIELD]: { get: () => disabled },
    [HIDDEN_SCENE_TAGS_FIELD]: { get: () => [] },
  } as unknown as Config
  apply(ctx, config)
  return captured
}

/** Let the plugin's injection callbacks run. */
const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/**
 * Every candidate one `list()` read advertises, whichever output shape the
 * provider chose.
 *
 * The `unknown` binding is deliberate: `Array.isArray` narrows a
 * `readonly T[]` union member to `any[]`, so testing the union directly both
 * breaks the exhaustiveness of the false branch and hands the rest of the test
 * an untyped list.
 * @param provider - the provider under test.
 * @returns the advertised candidates.
 */
async function listed(provider: SkillProvider): Promise<readonly SkillCandidate[]> {
  const output: unknown = await provider.list({})
  if (Array.isArray(output)) return output as readonly SkillCandidate[]
  return (output as SkillProviderObservation).candidates
}

/** The names one `list()` read advertises. */
async function listedNames(provider: SkillProvider): Promise<readonly string[]> {
  const candidates = await listed(provider)
  return candidates.map(candidate => candidate.name)
}

describe('ui-sdkwork-skills Host half', () => {
  it('keeps its own section off the generated settings pages', async () => {
    const b = bench()
    await flush()

    expect(b.configure).toHaveBeenCalledTimes(1)
    expect(b.configure.mock.calls[0]?.[0]).toEqual({ auto: false })
  })

  it('declares the section even without a skill registry', async () => {
    const b = bench({ withSkills: false })
    await flush()

    expect(b.configure).toHaveBeenCalledTimes(1)
    expect(b.provider).toBeUndefined()
  })

  it('advertises one suppression candidate per disabled name', async () => {
    const b = bench({ disabled: ['birdcoder-tts', 'birdcoder-video'] })
    await flush()
    const list = await listed(b.provider as SkillProvider)

    expect(list.map(candidate => candidate.name)).toEqual(['birdcoder-tts', 'birdcoder-video'])
    for (const candidate of list) {
      expect(candidate.provider).toBe('sdkwork-skill-suppression')
      expect(candidate.invocation).toEqual({ modelInvocable: false, userInvocable: false })
      // Below every filesystem root (project `.dsh/skills` ranks 100), which is
      // what makes this win a same-name comparison inside the global layer —
      // the built-ins live under `.agents/skills` at rank 200.
      expect(candidate.rank).toBeLessThan(100)
    }
  })

  it('drops names the registry would reject instead of failing the catalog', async () => {
    const b = bench({ disabled: ['birdcoder-tts', 'Not A Name', 42, '', 'ok-name', 'birdcoder-tts'] })
    await flush()

    expect(await listedNames(b.provider as SkillProvider)).toEqual(['birdcoder-tts', 'ok-name'])
  })

  it('tolerates a hand-edited section whose field is not a list', async () => {
    const b = bench()
    await flush()
    b.setDisabledSkills('not-a-list')

    expect(await listedNames(b.provider as SkillProvider)).toEqual([])
  })

  it('loads a suppression body for a listed candidate', async () => {
    const b = bench({ disabled: ['birdcoder-tts'] })
    await flush()
    const candidates = await listed(b.provider as SkillProvider)
    const candidate = candidates[0]

    expect(candidate).toBeDefined()
    if (candidate === undefined) return

    const definition = await (b.provider as SkillProvider).get(candidate, {})

    expect(definition?.name).toBe('birdcoder-tts')
    expect(definition?.content.length).toBeGreaterThan(0)
    expect(definition?.invocation).toEqual({ modelInvocable: false, userInvocable: false })
  })

  it('invalidates the registry catalog when its own entry commits', async () => {
    const b = bench()
    await flush()
    expect(b.invalidate).not.toHaveBeenCalled()

    b.commit(UI_SKILLS_NAMESPACE)

    expect(b.invalidate).toHaveBeenCalledTimes(1)
  })

  it('ignores a commit addressed to another entry', async () => {
    const b = bench()
    await flush()

    b.commit('ui-theme')

    expect(b.invalidate).not.toHaveBeenCalled()
  })

  it('reads the section per call, so a commit is visible without invalidation', async () => {
    const b = bench({ disabled: ['birdcoder-tts'] })
    await flush()
    expect(await listedNames(b.provider as SkillProvider)).toEqual(['birdcoder-tts'])

    b.setDisabledSkills(['birdcoder-video'])

    expect(await listedNames(b.provider as SkillProvider)).toEqual(['birdcoder-video'])
  })
})
