/**
 * ui-sdkwork-skills Host half spec: the durable settings section registration
 * and the suppression provider that turns a disabled skill into a skill the
 * catalogs no longer serve.
 *
 * Driven directly against a real Cordis context with stand-in `settings` and
 * `skills` services, because what is under test is the seam between them: the
 * namespace key the browser will bind, the rank that has to beat every
 * filesystem root, the invocation policy that has to hide the name from both
 * the user catalog and the model catalog, and the invalidation that makes a
 * settings commit visible to the next read.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type {
  SkillCandidate, SkillProvider, SkillProviderControl, SkillProviderObservation,
} from '@deepseek-ai/dsh-skill'
import { apply, settingsNamespace } from '../src/index.ts'
import {
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, UI_SKILLS_NAMESPACE,
} from '../src/skills-settings.ts'

/** What the bench captured from one `apply()`. */
interface Bench {
  ctx: Context
  namespace: string | undefined
  provider: SkillProvider | undefined
  invalidate: ReturnType<typeof vi.fn>
  /** Replace the section the stand-in settings service resolves. */
  setSection: (section: Record<string, unknown>) => void
  /** Fire the registered namespace watch callback. */
  fireChange: () => void
}

/**
 * Boot the Host half over stand-in settings/skills services.
 *
 * The returned object is filled in by the plugin's own registration callbacks,
 * so read `provider` and `namespace` off it after `flush()` — destructuring it
 * up front would capture the placeholders the callbacks later replace.
 * @param options.disabled - the suppressed names the section starts with.
 * @param options.withSkills - whether a skill registry is composed at all.
 * @returns the captured registrations and the drivers that move them.
 */
function bench(options: { disabled?: readonly unknown[]; withSkills?: boolean } = {}): Bench {
  const ctx = new Context()
  let section: Record<string, unknown> = {
    [DISABLED_SKILLS_FIELD]: [...(options.disabled ?? ['birdcoder-tts'])],
    [HIDDEN_SCENE_TAGS_FIELD]: [],
  }
  let change: (() => void) | undefined
  const invalidate = vi.fn()

  ctx.provide('settings' as never, {
    register: (namespace: string) => {
      captured.namespace = namespace
      return {
        get: () => section,
        watch: (callback: () => void) => {
          change = callback
          return () => { change = undefined }
        },
        update: () => Promise.resolve(),
        replace: () => Promise.resolve(),
      }
    },
  } as never)
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
    namespace: undefined,
    provider: undefined,
    invalidate,
    setSection: (next) => { section = next },
    fireChange: () => { change?.() },
  }
  apply(ctx)
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
  it('registers the durable section under the namespace the browser binds', async () => {
    const b = bench()
    await flush()

    expect(b.namespace).toBe(UI_SKILLS_NAMESPACE)
    expect(UI_SKILLS_NAMESPACE).toBe('ui-sdkwork-skills')
  })

  it('registers the section even without a skill registry', async () => {
    const b = bench({ withSkills: false })
    await flush()

    expect(b.namespace).toBe(UI_SKILLS_NAMESPACE)
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
    b.setSection({ [DISABLED_SKILLS_FIELD]: 'not-a-list' })

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

  it('invalidates the registry catalog when the section changes', async () => {
    const b = bench()
    await flush()
    expect(b.invalidate).not.toHaveBeenCalled()

    b.fireChange()

    expect(b.invalidate).toHaveBeenCalledTimes(1)
  })

  it('reads the section per call, so a commit is visible without invalidation', async () => {
    const b = bench({ disabled: ['birdcoder-tts'] })
    await flush()
    expect(await listedNames(b.provider as SkillProvider)).toEqual(['birdcoder-tts'])

    b.setSection({ [DISABLED_SKILLS_FIELD]: ['birdcoder-video'] })

    expect(await listedNames(b.provider as SkillProvider)).toEqual(['birdcoder-video'])
  })
})

describe('settingsNamespace', () => {
  it('accepts a lowercase hyphenated key and brands it', () => {
    expect(settingsNamespace('ui-sdkwork-skills')).toBe('ui-sdkwork-skills')
  })

  it('rejects a malformed key', () => {
    expect(() => settingsNamespace('UI_Skills')).toThrow(TypeError)
    expect(() => settingsNamespace('1-skill')).toThrow(TypeError)
  })
})
