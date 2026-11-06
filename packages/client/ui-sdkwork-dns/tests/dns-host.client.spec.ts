// @vitest-environment jsdom
/**
 * The DNS host adapter: readiness, client identity across environment
 * switches, token mirroring, listener fan-out, and disposal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { DnsHost, mountDnsHost } from '../src/client/dnsHost.ts'

interface EnvironmentState {
  baseUrl: string
  accessToken?: string
  session?: { accessToken?: string; authToken?: string; refreshToken?: string } | null
}

/** Controllable env + IAM faces. */
function bench(initial: EnvironmentState = { baseUrl: '' }) {
  const state = { ...initial }
  const envListeners = new Set<() => void>()
  const iamListeners = new Set<() => void>()
  const env = {
    apiBaseUrl: () => state.baseUrl,
    accessToken: () => state.accessToken ?? '',
    subscribe: vi.fn((listener: () => void) => {
      envListeners.add(listener)
      return () => { envListeners.delete(listener) }
    }),
  }
  const iam = {
    controller: {
      getState: () => ({ session: state.session ?? null }),
      subscribe: vi.fn((listener: () => void) => {
        iamListeners.add(listener)
        return () => { iamListeners.delete(listener) }
      }),
    },
  }
  return { state, env, iam, envListeners, iamListeners }
}

afterEach(() => {
  resetSdkworkGlobalTokenManager()
})

describe('DnsHost', () => {
  it('reports unconfigured and builds no client without a gateway origin', () => {
    const b = bench()
    const host = new DnsHost({ env: b.env, iam: b.iam })
    expect(host.readReady()).toBe(false)
    expect(host.readClient()).toBeUndefined()
    expect(host.readRevision()).toBe(0)
  })

  it('builds one client per normalized origin and replaces it when the origin moves', () => {
    const b = bench({ baseUrl: 'https://api.example.com/' })
    const host = new DnsHost({ env: b.env, iam: b.iam })
    const first = host.readClient()
    expect(first).not.toBeUndefined()
    expect(host.readClient()).toBe(first)
    b.state.baseUrl = 'https://api.example.com'
    // Trailing slashes are normalized, so the same deployment keeps its client.
    expect(host.readClient()).toBe(first)
    b.state.baseUrl = 'https://api2.example.com'
    expect(host.readClient()).not.toBe(first)
  })

  it('mirrors the IAM session into the shared token manager on every read', () => {
    const b = bench({ baseUrl: 'https://api.example.com' })
    const host = new DnsHost({ env: b.env, iam: b.iam })
    host.readClient()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({})
    b.state.session = { accessToken: 'access-1', authToken: 'auth-1', refreshToken: 'refresh-1' }
    host.readClient()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: 'access-1',
      authToken: 'auth-1',
      refreshToken: 'refresh-1',
    })
    // An env token fills access-token while signed out.
    b.state.session = null
    b.state.accessToken = 'static-token'
    host.readClient()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({ accessToken: 'static-token' })
  })

  it('publishes revision and listener changes on environment and session transitions', () => {
    const b = bench()
    const host = new DnsHost({ env: b.env, iam: b.iam })
    host.mount()
    const listener = vi.fn()
    const off = host.subscribe(listener)
    const revisionBefore = host.readRevision()
    for (const notify of b.envListeners) notify()
    expect(host.readRevision()).toBe(revisionBefore + 1)
    expect(listener).toHaveBeenCalledTimes(1)
    for (const notify of b.iamListeners) notify()
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    for (const notify of b.envListeners) notify()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops publishing after disposal and is idempotent', () => {
    const b = bench()
    const host = new DnsHost({ env: b.env, iam: b.iam })
    host.mount()
    const listener = vi.fn()
    host.subscribe(listener)
    // Hold the captured notifier across disposal: the disposed guard, not the
    // subscription table, must keep a late notification silent.
    const lateNotifier = [...b.envListeners][0]
    host.dispose()
    host.dispose()
    lateNotifier()
    for (const notify of b.envListeners) notify()
    expect(listener).not.toHaveBeenCalled()
    expect(b.envListeners.size).toBe(0)
    expect(b.iamListeners.size).toBe(0)
  })

  it('mounts through the convenience factory', () => {
    const b = bench({ baseUrl: 'https://api.example.com' })
    const host = mountDnsHost({ env: b.env, iam: b.iam })
    expect(host).toBeInstanceOf(DnsHost)
    expect(host.readReady()).toBe(true)
    host.dispose()
  })
})
