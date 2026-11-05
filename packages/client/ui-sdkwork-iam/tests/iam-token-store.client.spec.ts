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

  it('keeps the cached identity and context across a token rotation', async () => {
    const backing = storage()
    const store = createIamTokenStore({ storageKey: 'k', storage: backing })
    await store.set({
      accessToken: 'at-1',
      authToken: 'auth-1',
      refreshToken: 'rt-1',
      sessionId: 's-1',
      context: { tenantId: '100001', appId: 'birdcoder' },
      user: { id: 'u1', displayName: 'Bird User', email: 'bird@example.test' },
    })

    // A pre-expiry refresh writes tokens only: the identity and AppContext it
    // cannot restate must survive the write.
    await store.set({ accessToken: 'at-2', authToken: 'auth-2', refreshToken: 'rt-2' })
    await expect(store.get()).resolves.toMatchObject({
      accessToken: 'at-2',
      authToken: 'auth-2',
      refreshToken: 'rt-2',
      sessionId: 's-1',
      context: { tenantId: '100001', appId: 'birdcoder' },
      user: { id: 'u1', displayName: 'Bird User' },
    })

    // A new login replaces the identity it carries.
    await store.set({ accessToken: 'at-3', authToken: 'auth-3', user: { id: 'u2', displayName: 'Other' } })
    await expect(store.get()).resolves.toMatchObject({ user: { id: 'u2', displayName: 'Other' } })
  })

  it('invokes the token-sync hook on read and write with the session', async () => {
    const onTokens = vi.fn()
    const store = createIamTokenStore({ storageKey: 'k', storage: storage(), onTokens })
    await store.set({ accessToken: 'at' })
    expect(onTokens).toHaveBeenLastCalledWith({ accessToken: 'at' })
    await store.get()
    expect(onTokens).toHaveBeenLastCalledWith({ accessToken: 'at' })
  })

  it('mirrors every commit into the durable host copy without a local token copy', async () => {
    const backing = storage()
    const durable = host()
    const store = createIamTokenStore({ storageKey: 'k', storage: backing, host: durable })
    const session = { accessToken: 'at', authToken: 'auth', refreshToken: 'rt', sessionId: 's' }
    await store.set(session)
    expect(durable.value).toEqual(session)
    expect(durable.saves).toBe(1)
    expect(backing.data.has('k')).toBe(false)
  })

  it('restores a session from the durable copy when the browser has none', async () => {
    const backing = storage()
    const durable = host({ version: 1, savedAt: 'now', accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    const onTokens = vi.fn()
    const store = createIamTokenStore({ storageKey: 'dsh.iam.session', storage: backing, host: durable, onTokens })

    await expect(store.get()).resolves.toEqual({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    // Desktop tokens stay only in the encrypted host copy.
    expect(backing.data.has('dsh.iam.session')).toBe(false)
    expect(onTokens).toHaveBeenLastCalledWith({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
  })

  it('prefers the durable copy and removes a stale local copy', async () => {
    const backing = storage()
    backing.setItem('k', JSON.stringify({ accessToken: 'local', authToken: 'local' }))
    const durable = host({ accessToken: 'host', authToken: 'host' })
    const store = createIamTokenStore({ storageKey: 'k', storage: backing, host: durable })
    await expect(store.get()).resolves.toEqual({ accessToken: 'host', authToken: 'host' })
    expect(backing.data.has('k')).toBe(false)
  })

  it('migrates a legacy local session into the durable copy and removes it', async () => {
    const backing = storage()
    backing.setItem('k', JSON.stringify({ accessToken: 'legacy', authToken: 'legacy', refreshToken: 'rt' }))
    const durable = host()
    const store = createIamTokenStore({ storageKey: 'k', storage: backing, host: durable })
    await expect(store.get()).resolves.toEqual({
      accessToken: 'legacy',
      authToken: 'legacy',
      refreshToken: 'rt',
    })
    expect(durable.value).toEqual({ accessToken: 'legacy', authToken: 'legacy', refreshToken: 'rt' })
    expect(backing.data.has('k')).toBe(false)
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
