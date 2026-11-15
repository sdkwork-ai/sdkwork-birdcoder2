// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createTokenPlanAccountStore } from '../src/client/token-plan-account.ts'
import type { TokenPlanComputeAccount } from '../src/client/token-plan-service.ts'

function computeAccount(available: number | undefined): TokenPlanComputeAccount {
  return {
    assetType: 'token_bank',
    available,
    frozen: 0,
    pending: 0,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('Token Bank account store', () => {
  it('settles a guest without making an account request', async () => {
    const read = vi.fn()
    const store = createTokenPlanAccountStore({ read, signedIn: () => false })

    expect(store.getSnapshot()).toEqual({
      account: undefined,
      points: null,
      status: 'signed-out',
    })
    await store.refresh()
    expect(read).not.toHaveBeenCalled()
    expect(store.getSnapshot().status).toBe('signed-out')
  })

  it('publishes the settled Token Bank balance and notifies subscribers', async () => {
    const read = vi.fn().mockResolvedValue(computeAccount(12.5))
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    expect(store.getSnapshot().status).toBe('loading')
    await store.refresh()
    expect(store.getSnapshot()).toEqual({
      account: computeAccount(12.5),
      points: 12.5,
      status: 'ready',
    })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    await store.refresh()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps the last settled balance when a refresh fails', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(computeAccount(9))
      .mockRejectedValueOnce(new Error('gateway down'))
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })

    await store.refresh()
    expect(store.getSnapshot().points).toBe(9)

    await store.refresh()
    expect(store.getSnapshot()).toMatchObject({ points: 9, status: 'error' })
  })

  it('reports a failed first read as an error without inventing a balance', async () => {
    const read = vi.fn().mockRejectedValue(new Error('gateway down'))
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })

    await store.refresh()
    expect(store.getSnapshot()).toEqual({
      account: undefined,
      points: null,
      status: 'error',
    })
  })

  it('settles to signed-out when the session disappears during a read', async () => {
    const read = vi.fn().mockResolvedValue(undefined)
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })

    await store.refresh()
    expect(store.getSnapshot().status).toBe('signed-out')
    expect(store.getSnapshot().points).toBeNull()
  })

  it('keeps a missing available amount as an unknown balance', async () => {
    const read = vi.fn().mockResolvedValue(computeAccount(undefined))
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })

    await store.refresh()
    expect(store.getSnapshot()).toMatchObject({ points: null, status: 'ready' })
  })

  it('ignores an older read that settles after a newer one', async () => {
    const older = deferred<TokenPlanComputeAccount | undefined>()
    const newer = deferred<TokenPlanComputeAccount | undefined>()
    const read = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })

    const olderRefresh = store.refresh()
    const newerRefresh = store.refresh()
    newer.resolve(computeAccount(20))
    await newerRefresh
    expect(store.getSnapshot()).toMatchObject({ points: 20, status: 'ready' })

    older.resolve(computeAccount(10))
    await olderRefresh
    expect(store.getSnapshot()).toMatchObject({ points: 20, status: 'ready' })
  })

  it('ignores an older failed read after a newer read started', async () => {
    const older = deferred<TokenPlanComputeAccount | undefined>()
    const newer = deferred<TokenPlanComputeAccount | undefined>()
    const read = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })

    const olderRefresh = store.refresh()
    const newerRefresh = store.refresh()
    older.reject(new Error('stale failure'))
    await olderRefresh
    expect(store.getSnapshot().status).toBe('loading')

    newer.resolve(computeAccount(3))
    await newerRefresh
    expect(store.getSnapshot()).toMatchObject({ points: 3, status: 'ready' })
  })
})
