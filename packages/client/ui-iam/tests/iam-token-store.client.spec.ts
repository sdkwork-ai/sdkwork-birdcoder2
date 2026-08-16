import { describe, expect, it, vi } from 'vitest'
import { createIamTokenStore, type IamStorageLike } from '../src/client/iam-token-store.ts'

function storage(): IamStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
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
})
