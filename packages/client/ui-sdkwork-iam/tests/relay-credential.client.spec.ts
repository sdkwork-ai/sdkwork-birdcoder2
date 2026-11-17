/**
 * The relay session credential mirror: what crosses the Host credential plane
 * after a sign-in, a rotation, and a sign-out, and how a refused write behaves.
 */
import { describe, expect, it } from 'vitest'
import {
  BIRDCODER_SESSION_CREDENTIAL_REF,
  startRelayCredentialMirror,
} from '../src/client/relay-credential.ts'

interface FakeCredentialState {
  readonly values: Map<string, string>
  readonly writes: string[]
  readonly failures: { set: boolean; unset: boolean }
}

function fakeCredentials(): FakeCredentialState {
  const state: FakeCredentialState = {
    values: new Map(),
    writes: [],
    failures: { set: false, unset: false },
  }
  return state
}

function mirror(state: FakeCredentialState, initial: string | undefined) {
  let token = initial
  const listeners = new Set<() => void>()
  const logs: string[] = []
  const stop = startRelayCredentialMirror({
    authToken: () => token,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    credentials: {
      set: async (ref, value) => {
        if (state.failures.set) return { ok: false }
        state.values.set(ref, value)
        state.writes.push(value)
        return { ok: true }
      },
      unset: async (ref) => {
        if (state.failures.unset) return { ok: false }
        state.values.delete(ref)
        return { ok: true }
      },
    },
    log: (message) => { logs.push(message) },
  })
  return {
    settle: async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0) }) },
    signIn: (next: string) => {
      token = next
      for (const listener of listeners) listener()
    },
    signOut: () => {
      token = undefined
      for (const listener of listeners) listener()
    },
    stop,
    logs,
  }
}

describe('startRelayCredentialMirror', () => {
  it('mirrors the signed-in token under the session reference', async () => {
    const state = fakeCredentials()
    const m = mirror(state, 'header.payload.signature')
    await m.settle()
    expect(state.values.get(BIRDCODER_SESSION_CREDENTIAL_REF)).toBe('header.payload.signature')
    expect(state.writes).toHaveLength(1)
  })

  it('follows a rotated token and writes it once per value', async () => {
    const state = fakeCredentials()
    const m = mirror(state, 'token-1')
    await m.settle()
    m.signIn('token-1')
    await m.settle()
    m.signIn('token-2')
    await m.settle()

    expect(state.values.get(BIRDCODER_SESSION_CREDENTIAL_REF)).toBe('token-2')
    expect(state.writes).toEqual(['token-1', 'token-2'])
  })

  it('clears the reference when the session ends', async () => {
    const state = fakeCredentials()
    const m = mirror(state, 'token-1')
    await m.settle()
    m.signOut()
    await m.settle()

    expect(state.values.has(BIRDCODER_SESSION_CREDENTIAL_REF)).toBe(false)
  })

  it('clears a reference a previous page left behind', async () => {
    const state = fakeCredentials()
    state.values.set(BIRDCODER_SESSION_CREDENTIAL_REF, 'stale-from-an-earlier-page')
    const m = mirror(state, undefined)
    await m.settle()

    expect(state.values.has(BIRDCODER_SESSION_CREDENTIAL_REF)).toBe(false)
  })

  it('retries a refused write on the next credential change', async () => {
    const state = fakeCredentials()
    state.failures.set = true
    const m = mirror(state, 'token-1')
    await m.settle()
    expect(state.values.has(BIRDCODER_SESSION_CREDENTIAL_REF)).toBe(false)
    expect(m.logs).toHaveLength(1)

    state.failures.set = false
    m.signIn('token-2')
    await m.settle()
    expect(state.values.get(BIRDCODER_SESSION_CREDENTIAL_REF)).toBe('token-2')
  })

  it('stops publishing after teardown', async () => {
    const state = fakeCredentials()
    const m = mirror(state, 'token-1')
    await m.settle()
    m.stop()
    m.signIn('token-2')
    await m.settle()

    expect(state.values.get(BIRDCODER_SESSION_CREDENTIAL_REF)).toBe('token-1')
  })
})
