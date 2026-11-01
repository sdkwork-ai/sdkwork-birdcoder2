// @vitest-environment jsdom
/**
 * ui-sdkwork-persona browser half: the settings-menu seam binding, the overlay
 * registration (with fiber teardown proving removal — HMR safety), the
 * first-run gate's open-once latch, and the write paths behind the picker.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PersonaMenuSource } from '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/client'
import { apply, inject } from '../src/client/index.ts'
import { DEFAULT_PERSONA_SETTINGS, PERSONA_ROLE_IDS, type PersonaSettings } from '../src/persona-settings.ts'
import { PersonaDialog, type PersonaDialogInjected } from '../src/client/PersonaDialog.tsx'
import { createPersonaPickerStore } from '../src/client/persona-ui-store.ts'
import { PERSONA_INTEREST_IDS, type PersonaInterestId } from '../src/client/catalog.ts'

/** A controllable mirror of the `ui-sdkwork-persona` Host section. */
function fakePersonaForm(
  initial: Partial<PersonaSettings> = {},
  options: { status?: 'loading' | 'ready' | 'unavailable'; writable?: boolean } = {},
) {
  let snapshot: {
    status: 'loading' | 'ready' | 'unavailable'
    value: PersonaSettings | undefined
    base: undefined
    user: undefined
    revision: number | undefined
    writable: boolean
  } = {
    status: options.status ?? 'ready',
    value: (options.status ?? 'ready') === 'ready' ? { ...DEFAULT_PERSONA_SETTINGS, ...initial } : undefined,
    base: undefined,
    user: undefined,
    revision: 1,
    writable: options.writable ?? true,
  }
  const subscribers = new Set<() => void>()
  const publish = (): void => { for (const listener of [...subscribers]) listener() }
  const write = (next: PersonaSettings): void => {
    snapshot = { ...snapshot, value: next, revision: (snapshot.revision ?? 0) + 1 }
    publish()
  }
  const mutate = vi.fn(async (ops: readonly { op: 'set'; path: readonly string[]; value: unknown }[]) => {
    const next: PersonaSettings = { ...(snapshot.value ?? DEFAULT_PERSONA_SETTINGS) }
    for (const op of ops) {
      const [field] = op.path
      if (field === 'role') next.role = op.value as PersonaSettings['role']
      else if (field === 'interests') next.interests = op.value as string[]
      else if (field === 'promptDismissed') next.promptDismissed = op.value as boolean
    }
    write(next)
    return true
  })
  const set = vi.fn(async (field: string, value: unknown) => {
    write({ ...(snapshot.value ?? DEFAULT_PERSONA_SETTINGS), [field]: value })
    return true
  })
  return {
    scope: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        subscribers.add(listener)
        return () => { subscribers.delete(listener) }
      },
      mutate,
      set,
      unset: vi.fn(async () => true),
    } as never as ConfigForm<PersonaSettings>,
    mutate,
    set,
    setStatus: (next: 'loading' | 'ready' | 'unavailable') => {
      snapshot = { ...snapshot, status: next, value: next === 'ready' ? snapshot.value : undefined }
      publish()
    },
    setWritable: (next: boolean) => {
      snapshot = { ...snapshot, writable: next }
      publish()
    },
  }
}

/** A stand-in for the IAM account profile the persona service reads and writes. */
function fakeIam(options: {
  signedIn?: boolean
  configured?: boolean
  persona?: Partial<PersonaSettings>
  roleIds?: readonly (typeof PERSONA_ROLE_IDS)[number][]
  interestIds?: readonly (typeof PERSONA_INTEREST_IDS)[number][]
} = {}) {
  let signedIn = options.signedIn ?? false
  let persona: PersonaSettings = { ...DEFAULT_PERSONA_SETTINGS, ...options.persona }
  const listeners = new Set<() => void>()
  const publish = (): void => { for (const listener of [...listeners]) listener() }
  const toAccount = (value: PersonaSettings) => ({
    role: value.role === '' ? null : value.role,
    interests: [...value.interests],
    promptDismissed: value.promptDismissed,
    hasSelection: value.role !== '',
    catalogVersion: '20260101000000',
    updatedAt: null,
  })
  const retrievePersona = vi.fn(async () => toAccount(persona))
  const updatePersona = vi.fn(async (command: {
    role: string | null
    interests: string[]
    promptDismissed: boolean
  }) => {
    persona = {
      role: command.role === null ? '' : command.role as PersonaSettings['role'],
      interests: [...command.interests],
      promptDismissed: command.promptDismissed,
    }
    return toAccount(persona)
  })
  const clearPersona = vi.fn(async () => {
    persona = { ...DEFAULT_PERSONA_SETTINGS }
  })
  const retrievePersonaCatalog = vi.fn(async () => ({
    version: '20260101000000',
    roles: (options.roleIds ?? PERSONA_ROLE_IDS).map(code => ({ code })),
    interests: (options.interestIds ?? PERSONA_INTEREST_IDS).map(code => ({ code })),
  }))
  return {
    service: {
      isSignedIn: () => signedIn,
      isConfigured: () => options.configured ?? true,
      retrievePersona,
      updatePersona,
      clearPersona,
      retrievePersonaCatalog,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    retrievePersona,
    updatePersona,
    retrievePersonaCatalog,
    listenerCount: () => listeners.size,
    setSignedIn: (next: boolean) => {
      signedIn = next
      publish()
    },
  }
}

/** A stand-in for the settings-menu seam the plugin binds its source into. */
function personaSeam() {
  let source: PersonaMenuSource | undefined
  const setSource = vi.fn((next: PersonaMenuSource) => {
    source = next
    return () => { if (source === next) source = undefined }
  })
  return {
    getSnapshot: () => source?.getSnapshot() ?? { available: false },
    subscribe: () => () => {},
    open: () => { source?.open() },
    setSource,
    installed: () => source,
  }
}

/** Declare the overlay seat the way ui-layout does. */
function declare(slots: SlotRegistry): () => void {
  const dispose = slots.register(
    { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  return () => { dispose() }
}

/**
 * Invoke an entry's injected face: the runtime erases its positional params,
 * so the typed call is re-asserted here once instead of at every call site.
 * @param entry - the registration whose factory to run.
 * @param args - positional store actions the declaration derives.
 * @returns the injected business face.
 */
function faceOf<T>(entry: StoredEntry, ...args: unknown[]): T {
  if (entry.inject === undefined) throw new Error('the picker entry declares no inject face')
  const invoke = entry.inject as (...params: never[]) => T
  return invoke(...(args as never[]))
}

async function bench(
  initial: Partial<PersonaSettings> = {},
  options: {
    status?: 'loading' | 'ready' | 'unavailable'
    writable?: boolean
    signedIn?: boolean
    configured?: boolean
    accountPersona?: Partial<PersonaSettings>
    roleIds?: readonly (typeof PERSONA_ROLE_IDS)[number][]
    interestIds?: readonly (typeof PERSONA_INTEREST_IDS)[number][]
  } = {},
) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  // The seam label is asserted in the shipped Chinese copy.
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const form = fakePersonaForm(initial, options)
  ctx.provide('configForms', { get: () => form.scope } as never)
  const seam = personaSeam()
  ctx.provide('persona', seam as never)
  const iam = fakeIam({
    signedIn: options.signedIn ?? false,
    // A signed-out bench models a deployment without IAM unless a test says
    // otherwise, so the first-run gate keeps its immediate local-cache path.
    configured: options.configured ?? (options.signedIn ?? false),
    persona: options.accountPersona ?? {},
    ...(options.roleIds === undefined ? {} : { roleIds: options.roleIds }),
    ...(options.interestIds === undefined ? {} : { interestIds: options.interestIds }),
  })
  ctx.provide('iam', iam.service as never)
  const slots = ctx.get('slots') as never as SlotRegistry
  declare(slots)
  const fiber = ctx.plugin({ apply, inject })
  await fiber.await()
  return { ctx, form, seam, slots, fiber, iam }
}

/**
 * Bind the overlay registration's injected face the way the renderer does.
 * @param slots - the registry holding the persona picker entry.
 * @returns the picker store instance, its injected face, and its registration.
 */
function bindPicker(slots: SlotRegistry) {
  const entry = slots.entries('shell.overlay').find(candidate => candidate.component === PersonaDialog)!
  const store = entry.store as ReturnType<typeof createPersonaPickerStore>
  const instance = store.create()
  const face = faceOf<PersonaDialogInjected>(entry, instance.actions)
  return { entry, instance, face }
}

describe('ui-sdkwork-persona browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'configForms', 'iam', 'persona'])
  })

  it('registers the picker on the frame overlay and frees it on fiber teardown (HMR safety)', async () => {
    const b = await bench()
    expect(b.slots.entries('shell.overlay').map(entry => entry.options.id)).toContain('persona-picker')
    await b.fiber.dispose()
    expect(b.slots.entries('shell.overlay').map(entry => entry.options.id)).not.toContain('persona-picker')
    // The seam goes back to the unavailable default when the plugin unloads.
    expect(b.seam.installed()).toBeUndefined()
  })

  it('opens the picker once when no role is chosen, replaying the request the overlay was not yet bound for', async () => {
    const b = await bench()
    // The gate fired during apply, before the overlay bound its actions; the
    // request is replayed as the entrance binds, so nothing is lost.
    const { instance, face } = bindPicker(b.slots)
    expect(instance.getSnapshot().dialogOpen).toBe(true)
    // The face carries the live choices and the write path.
    expect(face.hooks.choices.getSnapshot()).toEqual(DEFAULT_PERSONA_SETTINGS)
    expect(face.hooks.writable.getSnapshot()).toBe(true)
    // A later scope notification does not reopen a dismissed picker.
    face.onClose()
    expect(instance.getSnapshot().dialogOpen).toBe(false)
    b.form.setStatus('ready')
    expect(instance.getSnapshot().dialogOpen).toBe(false)
  })

  it('stays closed when a role is already chosen, when the prompt was dismissed, or while the section is not writable', async () => {
    const chosen = await bench({ role: 'learner' })
    expect(bindPicker(chosen.slots).instance.getSnapshot().dialogOpen).toBe(false)
    const dismissed = await bench({ promptDismissed: true })
    expect(bindPicker(dismissed.slots).instance.getSnapshot().dialogOpen).toBe(false)
    const readOnly = await bench({}, { writable: false })
    expect(bindPicker(readOnly.slots).instance.getSnapshot().dialogOpen).toBe(false)
  })

  it('defers the first-run prompt until the settings section resolves', async () => {
    const b = await bench({}, { status: 'loading' })
    const { instance } = bindPicker(b.slots)
    expect(instance.getSnapshot().dialogOpen).toBe(false)
    b.form.setStatus('ready')
    expect(instance.getSnapshot().dialogOpen).toBe(true)
  })

  it('binds the settings-menu seam with availability and the localized role label', async () => {
    const b = await bench()
    expect(b.seam.setSource).toHaveBeenCalledTimes(1)
    expect(b.seam.getSnapshot()).toEqual({ available: true })
    const picker = bindPicker(b.slots)
    picker.face.onClose()
    b.form.mutate([{ op: 'set', path: ['role'], value: 'learner' }])
    expect(b.seam.getSnapshot()).toEqual({ available: true, roleLabel: '学员' })
    // An unchanged read keeps the cached profile: the observable contract
    // forbids a fresh object per read.
    expect(b.seam.getSnapshot()).toBe(b.seam.getSnapshot())
    // The seam's open gesture reaches the same picker.
    b.seam.open()
    expect(picker.instance.getSnapshot().dialogOpen).toBe(true)
  })

  it('spreads settings and locale changes through the seam subscription', async () => {
    const b = await bench()
    const seen = vi.fn()
    const off = b.seam.installed()!.subscribe(seen)
    b.form.mutate([{ op: 'set', path: ['role'], value: 'employee' }])
    expect(seen).toHaveBeenCalled()
    seen.mockClear()
    // The row label follows the active locale, so a locale switch re-renders.
    b.ctx.get('locale')!.setLocale('en')
    expect(seen).toHaveBeenCalled()
    off()
    seen.mockClear()
    b.form.mutate([{ op: 'set', path: ['role'], value: 'teacher' }])
    expect(seen).not.toHaveBeenCalled()
  })

  it('binds the picker hooks to the live settings scope', async () => {
    const b = await bench()
    const { face } = bindPicker(b.slots)
    const choices = vi.fn()
    const writable = vi.fn()
    const offChoices = face.hooks.choices.subscribe(choices)
    const offWritable = face.hooks.writable.subscribe(writable)
    b.form.mutate([{ op: 'set', path: ['interests'], value: ['employment'] }])
    expect(choices).toHaveBeenCalled()
    expect(face.hooks.choices.getSnapshot().interests).toEqual(['employment'])
    b.form.setWritable(false)
    expect(writable).toHaveBeenCalled()
    expect(face.hooks.writable.getSnapshot()).toBe(false)
    offChoices()
    offWritable()
  })

  it('writes one atomic mutation for a complete choice and records a dismissal without one', async () => {
    const b = await bench()
    const { face, instance } = bindPicker(b.slots)
    await expect(face.save('teacher', ['postgraduate', 'unknown-id'] as PersonaInterestId[])).resolves.toBe(true)
    expect(b.form.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['role'], value: 'teacher' },
      { op: 'set', path: ['interests'], value: ['postgraduate'] },
      { op: 'set', path: ['promptDismissed'], value: false },
    ])
    expect(b.form.set).not.toHaveBeenCalled()
    // Closing on a chosen role writes no dismissal marker.
    face.onClose()
    expect(b.form.set).not.toHaveBeenCalled()
    expect(instance.getSnapshot().dialogOpen).toBe(false)

    // With no role, the dismissal records the prompt answer so later launches
    // stay quiet.
    const fresh = await bench()
    const second = bindPicker(fresh.slots)
    second.face.onClose()
    expect(fresh.form.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['role'], value: '' },
      { op: 'set', path: ['interests'], value: [] },
      { op: 'set', path: ['promptDismissed'], value: true },
    ])
    expect(second.instance.getSnapshot().dialogOpen).toBe(false)
  })

  it('reads the account persona and mirrors it into the cache when signed in', async () => {
    const b = await bench({ role: 'employee' }, { signedIn: true, accountPersona: { role: 'teacher', interests: ['k12'] } })
    await vi.waitFor(() => { expect(b.iam.retrievePersona).toHaveBeenCalled() })
    await vi.waitFor(() => {
      expect(b.form.mutate).toHaveBeenCalledWith([
        { op: 'set', path: ['role'], value: 'teacher' },
        { op: 'set', path: ['interests'], value: ['k12'] },
        { op: 'set', path: ['promptDismissed'], value: false },
      ])
    })
    const { face } = bindPicker(b.slots)
    expect(face.hooks.choices.getSnapshot().role).toBe('teacher')
  })

  it('saves to the account when signed in and keeps the cache in step', async () => {
    const b = await bench({}, { signedIn: true })
    const { face } = bindPicker(b.slots)
    await expect(face.save('learner', ['postgraduate'])).resolves.toBe(true)
    expect(b.iam.updatePersona).toHaveBeenCalledWith({
      role: 'learner',
      interests: ['postgraduate'],
      promptDismissed: false,
    })
    await vi.waitFor(() => { expect(face.hooks.choices.getSnapshot().role).toBe('learner') })
  })

  it('reports a rejected account write instead of pretending the cache accepted it', async () => {
    const b = await bench({}, { signedIn: true })
    b.iam.updatePersona.mockRejectedValueOnce(new Error('offline'))
    const { face } = bindPicker(b.slots)
    await expect(face.save('developer', [])).resolves.toBe(false)
    expect(face.hooks.choices.getSnapshot().role).toBe('')
  })

  it('migrates a cache-only choice to the account once the account reports none', async () => {
    const b = await bench({ role: 'creator', interests: ['content'] }, { signedIn: true })
    await vi.waitFor(() => {
      expect(b.iam.updatePersona).toHaveBeenCalledWith({
        role: 'creator',
        interests: ['content'],
        promptDismissed: false,
      })
    })
  })

  it('releases the account subscription on fiber teardown (HMR safety)', async () => {
    const b = await bench({}, { signedIn: true })
    expect(b.iam.listenerCount()).toBeGreaterThan(0)
    await b.fiber.dispose()
    expect(b.iam.listenerCount()).toBe(0)
  })

  it('defers the prompt while a configured IAM restores its session, then prompts when it stays anonymous', async () => {
    const b = await bench({}, { configured: true, signedIn: false })
    const { instance } = bindPicker(b.slots)
    // The restore may still be in flight, so the cached emptiness is not yet a
    // reason to interrupt the person.
    expect(instance.getSnapshot().dialogOpen).toBe(false)
    await vi.waitFor(() => { expect(instance.getSnapshot().dialogOpen).toBe(true) }, { timeout: 3000 })
  })

  it('does not prompt when the restored account already holds a role', async () => {
    const b = await bench({}, { configured: true, signedIn: true, accountPersona: { role: 'learner' } })
    await vi.waitFor(() => { expect(b.iam.retrievePersona).toHaveBeenCalled() })
    const { instance } = bindPicker(b.slots)
    await vi.waitFor(() => { expect(b.form.mutate).toHaveBeenCalled() })
    expect(instance.getSnapshot().dialogOpen).toBe(false)
  })

  it('stays quiet when the signed-in account already holds a role', async () => {
    const b = await bench({}, { signedIn: true, accountPersona: { role: 'partner' } })
    await vi.waitFor(() => { expect(b.iam.retrievePersona).toHaveBeenCalled() })
    const { instance } = bindPicker(b.slots)
    expect(instance.getSnapshot().dialogOpen).toBe(false)
  })
})
