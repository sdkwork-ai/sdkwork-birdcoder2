import { describe, expect, it, vi } from 'vitest'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_PERSONA_SETTINGS, PERSONA_ROLE_IDS, type PersonaRoleId, type PersonaSettings,
} from '../src/persona-settings.ts'
import { PERSONA_INTEREST_IDS, type PersonaInterestId } from '../src/client/catalog.ts'
import { PersonaService, type PersonaAccountPort } from '../src/client/persona-service.ts'

/** A controllable mirror of the local cache section. */
function fakeForm(initial: Partial<PersonaSettings> = {}) {
  let value: PersonaSettings = { ...DEFAULT_PERSONA_SETTINGS, ...initial }
  const subscribers = new Set<() => void>()
  const mutate = vi.fn(async (ops: readonly { op: 'set'; path: readonly string[]; value: unknown }[]) => {
    const next = { ...value }
    for (const op of ops) {
      const [field] = op.path
      if (field === 'role') next.role = op.value as PersonaSettings['role']
      else if (field === 'interests') next.interests = op.value as string[]
      else if (field === 'promptDismissed') next.promptDismissed = op.value as boolean
    }
    value = next
    for (const listener of [...subscribers]) listener()
    return true
  })
  return {
    scope: {
      getSnapshot: () => ({ status: 'ready' as const, value, base: undefined, user: undefined, revision: 1, writable: true }),
      subscribe: (listener: () => void) => {
        subscribers.add(listener)
        return () => { subscribers.delete(listener) }
      },
      mutate,
      set: vi.fn(async () => true),
      unset: vi.fn(async () => true),
    } as never as ConfigForm<PersonaSettings>,
    mutate,
    current: () => value,
  }
}

/** A controllable account port. */
function fakeAccount(options: {
  signedIn?: boolean
  retrieve?: () => Promise<PersonaSettings>
  catalog?: () => Promise<{ roleIds: readonly PersonaRoleId[]; interestIds: readonly PersonaInterestId[] }>
  save?: (choices: PersonaSettings) => Promise<PersonaSettings>
} = {}) {
  let signedIn = options.signedIn ?? true
  const listeners = new Set<() => void>()
  const retrieve = vi.fn(options.retrieve ?? (async () => ({ ...DEFAULT_PERSONA_SETTINGS })))
  const catalog = vi.fn(options.catalog ?? (async () => ({
    roleIds: PERSONA_ROLE_IDS,
    interestIds: PERSONA_INTEREST_IDS,
  })))
  const save = vi.fn(options.save ?? (async (choices: PersonaSettings) => choices))
  const account: PersonaAccountPort = {
    available: () => signedIn,
    retrieve,
    save,
    catalog,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return {
    account,
    retrieve,
    catalog,
    save,
    setSignedIn: (next: boolean) => {
      signedIn = next
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('PersonaService', () => {
  it('narrows the selectable ids onto the account catalog and notifies subscribers', async () => {
    const form = fakeForm()
    const account = fakeAccount({
      catalog: async () => ({ roleIds: ['learner', 'teacher'], interestIds: ['postgraduate', 'k12'] }),
    })
    const service = new PersonaService(form.scope, account.account, role => role)
    const seen = vi.fn()
    const stop = service.start()
    service.subscribe(seen)
    await vi.waitFor(() => {
      expect(service.selectable().roleIds).toEqual(['learner', 'teacher'])
    })
    expect(service.selectable().interestIds).toEqual(['postgraduate', 'k12'])
    expect(seen).toHaveBeenCalled()
    stop()
  })

  it('keeps the full local catalog when the account catalog cannot be read', async () => {
    const form = fakeForm()
    const account = fakeAccount({ catalog: async () => { throw new Error('offline') } })
    const service = new PersonaService(form.scope, account.account, role => role)
    const stop = service.start()
    await vi.waitFor(() => { expect(account.catalog).toHaveBeenCalled() })
    expect(service.selectable().roleIds).toEqual([...PERSONA_ROLE_IDS])
    expect(service.selectable().interestIds).toEqual([...PERSONA_INTEREST_IDS])
    stop()
  })

  it('falls back to the cache for the first-run gate when the account read fails', async () => {
    const form = fakeForm()
    const account = fakeAccount({ retrieve: async () => { throw new Error('offline') } })
    const service = new PersonaService(form.scope, account.account, role => role)
    const stop = service.start()
    await vi.waitFor(() => { expect(service.shouldPrompt()).toBe(true) })
    stop()
  })

  it('discards an in-flight account read when the account signs out', async () => {
    const form = fakeForm()
    let resolveRetrieve!: (value: PersonaSettings) => void
    const account = fakeAccount({
      retrieve: () => new Promise<PersonaSettings>((resolve) => { resolveRetrieve = resolve }),
    })
    const service = new PersonaService(form.scope, account.account, role => role)
    const stop = service.start()
    account.setSignedIn(false)
    resolveRetrieve({ role: 'teacher', interests: ['k12'], promptDismissed: false })
    await Promise.resolve()
    await Promise.resolve()
    expect(service.currentSettings().role).toBe('')
    expect(service.selectable().roleIds).toEqual([...PERSONA_ROLE_IDS])
    stop()
  })

  it('treats a role the catalog no longer offers as unchosen', async () => {
    const form = fakeForm({ role: 'teacher' })
    const account = fakeAccount({
      catalog: async () => ({ roleIds: ['learner'], interestIds: PERSONA_INTEREST_IDS }),
    })
    const service = new PersonaService(form.scope, account.account, role => role)
    const stop = service.start()
    await vi.waitFor(() => { expect(service.selectable().roleIds).toEqual(['learner']) })
    expect(service.isConfigured()).toBe(false)
    expect(service.shouldPrompt()).toBe(true)
    expect(service.menuProfile().roleLabel).toBeUndefined()
    stop()
  })

  it('migrates a signed-out dismissal to the account even without a role', async () => {
    const form = fakeForm({ promptDismissed: true })
    const account = fakeAccount()
    const service = new PersonaService(form.scope, account.account, role => role)
    const stop = service.start()
    await vi.waitFor(() => {
      expect(account.save).toHaveBeenCalledWith({
        role: '',
        interests: [],
        promptDismissed: true,
      })
    })
    await vi.waitFor(() => { expect(service.currentSettings().promptDismissed).toBe(true) })
    expect(service.shouldPrompt()).toBe(false)
    stop()
  })

  it('reports a rejected account save without writing the cache', async () => {
    const form = fakeForm()
    const account = fakeAccount({
      save: async () => { throw new Error('offline') },
    })
    const service = new PersonaService(form.scope, account.account, role => role)
    const stop = service.start()
    // Let the successful sync mirror the account persona into the cache first,
    // so the assertion below only observes the rejected save.
    await vi.waitFor(() => { expect(form.mutate).toHaveBeenCalled() })
    form.mutate.mockClear()
    await expect(service.save('learner', [])).resolves.toBe(false)
    expect(form.mutate).not.toHaveBeenCalled()
    expect(service.currentSettings().role).toBe('')
    stop()
  })
})
