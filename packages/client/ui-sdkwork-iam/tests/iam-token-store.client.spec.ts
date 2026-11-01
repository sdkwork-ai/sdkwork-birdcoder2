import { describe, expect, it, vi } from 'vitest'
import {
  createIamTokenStore,
  hasIamSessionTokens,
  normalizeHostIamSession,
  type IamSessionHostPort,
  type IamStorageLike,
} from '../src/client/iam-token-store.ts'

function storage(): IamStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

/** Durable host copy backed by a mutable record, standing in for `<DSH_HOME>`. */
function host(initial: unknown = null): IamSessionHostPort & { value: unknown; saves: number } {
  const port = {
    value: initial,
    saves: 0,
    async read() { return port.value },
    async save(session: unknown) { port.value = session; port.saves += 1 },
    async clear() { port.value = null },
  }
  return port
}

describe('createIamTokenStore', () => {
  it('reads the anonymous record when nothing is stored', async () => {
    const store = createIamTokenStore({ storageKey: 'k', storage: storage() })
    await expect(store.get()).resolves.toEqual({})
  })

  it('round-trips a stored session through the storage key', async () => {
    const backing = storage()
    const store = createIamTokenStore({ storageKey: 'dsh.iam.session', storage: backing })
    const session = { accessToken: 'at', authToken: 'auth', expiresAt: 123, refreshToken: 'rt' }
    await store.set(session)
    expect(JSON.parse(backing.data.get('dsh.iam.session')!)).toEqual(session)
    await expect(store.get()).resolves.toEqual(session)
  })

  it('clears the stored session', async () => {
    const backing = storage()
    const store = createIamTokenStore({ storageKey: 'k', storage: backing })
    await store.set({ accessToken: 'at', authToken: 'auth' })
    await store.clear()
    expect(backing.data.has('k')).toBe(false)
    await expect(store.get()).resolves.toEqual({})
  })

  it('treats a corrupted blob as no session', async () => {
    const backing = storage()
    backing.setItem('k', '{not json')
    const store = createIamTokenStore({ storageKey: 'k', storage: backing })
    await expect(store.get()).resolves.toEqual({})
  })

  it('invokes the token-sync hook on read and write with the session', async () => {
    const onTokens = vi.fn()
    const store = createIamTokenStore({ storageKey: 'k', storage: storage(), onTokens })
    await store.set({ accessToken: 'at' })
    expect(onTokens).toHaveBeenLastCalledWith({ accessToken: 'at' })
    await store.get()
    expect(onTokens).toHaveBeenLastCalledWith({ accessToken: 'at' })
  })

  it('mirrors every commit into the durable host copy', async () => {
    const durable = host()
    const store = createIamTokenStore({ storageKey: 'k', storage: storage(), host: durable })
    const session = { accessToken: 'at', authToken: 'auth', refreshToken: 'rt', sessionId: 's' }
    await store.set(session)
    expect(durable.value).toEqual(session)
    expect(durable.saves).toBe(1)
  })

  it('restores a session from the durable copy when the browser has none', async () => {
    const backing = storage()
    const durable = host({ version: 1, savedAt: 'now', accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    const onTokens = vi.fn()
    const store = createIamTokenStore({ storageKey: 'dsh.iam.session', storage: backing, host: durable, onTokens })

    await expect(store.get()).resolves.toEqual({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    // The restored copy is written back so later boot reads stay local, and
    // the token manager receives it through the same hook as a local read.
    expect(JSON.parse(backing.data.get('dsh.iam.session')!)).toEqual({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    expect(onTokens).toHaveBeenLastCalledWith({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
  })

  it('prefers the local session over the durable copy', async () => {
    const backing = storage()
    backing.setItem('k', JSON.stringify({ accessToken: 'local', authToken: 'local' }))
    const durable = host({ accessToken: 'host', authToken: 'host' })
    const store = createIamTokenStore({ storageKey: 'k', storage: backing, host: durable })
    await expect(store.get()).resolves.toEqual({ accessToken: 'local', authToken: 'local' })
  })

  it('rejects the commit when the durable copy cannot be written', async () => {
    const backing = storage()
    const durable: IamSessionHostPort = {
      read: async () => null,
      save: async () => { throw new Error('disk full') },
      clear: async () => {},
    }
    const store = createIamTokenStore({ storageKey: 'k', storage: backing, host: durable })
    await expect(store.set({ accessToken: 'at', authToken: 'auth' })).rejects.toThrow('disk full')
    // A rejected commit leaves no browser-local-only login behind: the durable
    // copy is written first, so the two stores never disagree about the login.
    expect(backing.data.has('k')).toBe(false)
  })

  it('clears both copies on sign-out', async () => {
    const backing = storage()
    const durable = host({ accessToken: 'at', authToken: 'auth' })
    const store = createIamTokenStore({ storageKey: 'k', storage: backing, host: durable })
    await store.set({ accessToken: 'at', authToken: 'auth' })
    await store.clear()
    expect(backing.data.has('k')).toBe(false)
    expect(durable.value).toBeNull()
  })

  it('ignores an incomplete durable record', async () => {
    const store = createIamTokenStore({
      storageKey: 'k',
      storage: storage(),
      host: host({ accessToken: 'at' }),
    })
    await expect(store.get()).resolves.toEqual({})
  })
})

describe('durable session shape', () => {
  it('requires the dual-token pair', () => {
    expect(hasIamSessionTokens({ accessToken: 'at', authToken: 'auth' })).toBe(true)
    expect(hasIamSessionTokens({ accessToken: 'at', authToken: '   ' })).toBe(false)
    expect(hasIamSessionTokens({ accessToken: 'at' })).toBe(false)
  })

  it('drops transport-only fields and keeps the complete session', () => {
    expect(normalizeHostIamSession({
      version: 1,
      savedAt: '2026-11-01T00:00:00.000Z',
      authToken: 'auth',
      accessToken: 'at',
      refreshToken: 'rt',
      sessionId: 's',
      expiresAt: 123,
      user: { id: 'u1' },
      context: { tenantId: '1' },
    })).toEqual({
      authToken: 'auth',
      accessToken: 'at',
      refreshToken: 'rt',
      sessionId: 's',
      expiresAt: 123,
      user: { id: 'u1' },
      context: { tenantId: '1' },
    })
    expect(normalizeHostIamSession({ authToken: 'auth' })).toBeUndefined()
    expect(normalizeHostIamSession('nope')).toBeUndefined()
  })
})
