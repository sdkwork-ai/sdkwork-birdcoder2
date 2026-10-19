import { describe, expect, it, vi } from 'vitest'
import { AccountRuntime, type AccountSource } from '../src/client/account.ts'

describe('AccountRuntime', () => {
  it('holds the anonymous snapshot with a stable reference and subscription lifecycle', () => {
    const account = new AccountRuntime()
    const first = account.getSnapshot()
    expect(first).toEqual({ signedIn: false })
    expect(account.getSnapshot()).toBe(first)
    const listener = vi.fn()
    const dispose = account.subscribe(listener)
    dispose()
    expect(listener).not.toHaveBeenCalled()
  })

  it('logout and signIn resolve without a session', async () => {
    const account = new AccountRuntime()
    await expect(account.logout()).resolves.toBeUndefined()
    await expect(account.signIn()).resolves.toBeUndefined()
  })

  it('delegates the snapshot face and gestures to the swapped source', async () => {
    const account = new AccountRuntime()
    const profile = { signedIn: true, username: 'birdcoder', signInAvailable: true }
    const logout = vi.fn()
    const signIn = vi.fn()
    const subscribe = vi.fn(() => () => {})
    const source: AccountSource = {
      getSnapshot: () => profile,
      subscribe,
      logout,
      signIn,
    }
    account.setSource(source)

    expect(account.getSnapshot()).toBe(profile)
    const listener = vi.fn()
    const dispose = account.subscribe(listener)
    expect(subscribe).toHaveBeenCalledWith(listener)
    dispose()
    await account.logout()
    expect(logout).toHaveBeenCalledTimes(1)
    await account.signIn()
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('drops the previous source on swap', async () => {
    const account = new AccountRuntime()
    const firstLogout = vi.fn()
    account.setSource({
      getSnapshot: () => ({ signedIn: false }),
      subscribe: () => () => {},
      logout: firstLogout,
      signIn: () => {},
    })
    const secondLogout = vi.fn()
    account.setSource({
      getSnapshot: () => ({ signedIn: false }),
      subscribe: () => () => {},
      logout: secondLogout,
      signIn: () => {},
    })
    await account.logout()
    expect(firstLogout).not.toHaveBeenCalled()
    expect(secondLogout).toHaveBeenCalledTimes(1)
  })

  it('moves a live subscriber to the replacement source and announces the swap', () => {
    const account = new AccountRuntime()
    const firstDispose = vi.fn()
    const firstSubscribe = vi.fn((_listener: () => void) => firstDispose)
    account.setSource({
      getSnapshot: () => ({ signedIn: false }),
      subscribe: firstSubscribe,
      logout: () => {},
      signIn: () => {},
    })
    const listener = vi.fn()
    const unsubscribe = account.subscribe(listener)

    let secondEmit: (() => void) | undefined
    const secondDispose = vi.fn()
    const secondSubscribe = vi.fn((next: () => void) => { secondEmit = next; return secondDispose })
    const profile = { signedIn: true, username: 'birdcoder' }
    account.setSource({
      getSnapshot: () => profile,
      subscribe: secondSubscribe,
      logout: () => {},
      signIn: () => {},
    })

    expect(firstDispose).toHaveBeenCalledTimes(1)
    expect(secondSubscribe).toHaveBeenCalledWith(listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(account.getSnapshot()).toBe(profile)

    secondEmit?.()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    expect(secondDispose).toHaveBeenCalledTimes(1)
  })
})
