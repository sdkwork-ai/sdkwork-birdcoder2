/** The official-account host adapter: readiness, controller rebuilds, and token mirroring. */
import { afterEach, describe, expect, it } from 'vitest'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  OfficialAccountsHost,
  mountOfficialAccountsHost,
  type OfficialAccountsHostEnvironment,
  type OfficialAccountsHostIam,
  type OfficialAccountsHostSession,
} from '../src/client/officialAccountsHost.ts'

interface HarnessOptions {
  baseUrl?: string
  accessToken?: string
  session?: OfficialAccountsHostSession | null
}

/** Bench the adapter over a driven environment/session pair. */
function harness(options: HarnessOptions = {}) {
  let baseUrl = options.baseUrl ?? ''
  let accessToken = options.accessToken ?? ''
  let session = options.session ?? null
  const environmentListeners = new Set<() => void>()
  const iamListeners = new Set<() => void>()
  const env: OfficialAccountsHostEnvironment = {
    apiBaseUrl: () => baseUrl,
    accessToken: () => accessToken,
    subscribe: (listener) => {
      environmentListeners.add(listener)
      return () => { environmentListeners.delete(listener) }
    },
  }
  const iam: OfficialAccountsHostIam = {
    controller: {
      getState: () => ({ session }),
      subscribe: (listener) => {
        iamListeners.add(listener)
        return () => { iamListeners.delete(listener) }
      },
    },
  }
  const setEnvironment = (next: Partial<HarnessOptions>): void => {
    const environmentChanged = next.baseUrl !== undefined || next.accessToken !== undefined
    if (next.baseUrl !== undefined) baseUrl = next.baseUrl
    if (next.accessToken !== undefined) accessToken = next.accessToken
    if (next.session !== undefined) session = next.session
    if (environmentChanged) for (const listener of [...environmentListeners]) listener()
    if (next.session !== undefined) for (const listener of [...iamListeners]) listener()
  }
  return { env, iam, setEnvironment }
}

afterEach(() => {
  resetSdkworkGlobalTokenManager()
})

describe('OfficialAccountsHost', () => {
  it('reports readiness from the gateway origin only', () => {
    expect(new OfficialAccountsHost(harness()).readReady()).toBe(false)
    expect(new OfficialAccountsHost(harness({ baseUrl: 'https://gateway.example' })).readReady()).toBe(true)
  })

  it('exposes no controller without a gateway origin', () => {
    expect(new OfficialAccountsHost(harness()).readController()).toBeUndefined()
  })

  it('builds one controller per gateway origin and rebuilds it when the origin changes', () => {
    const bench = harness({ baseUrl: 'https://gateway.example' })
    const host = mountOfficialAccountsHost(bench)
    const first = host.readController()
    expect(first).toBeDefined()
    expect(host.readController()).toBe(first)

    bench.setEnvironment({ baseUrl: 'https://other.example' })
    expect(host.readController()).not.toBe(first)
    host.dispose()
  })

  it('mirrors the IAM session into the shared token manager before a read', () => {
    const bench = harness({
      baseUrl: 'https://gateway.example',
      accessToken: 'env-access-token',
      session: { accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh' },
    })
    const host = mountOfficialAccountsHost(bench)
    host.readController()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
      refreshToken: 'session-refresh',
    })

    bench.setEnvironment({ session: null, accessToken: '' })
    host.readController()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({})
    host.dispose()
  })

  it('falls back to the static access token while signed out', () => {
    const bench = harness({ baseUrl: 'https://gateway.example', accessToken: 'env-access-token' })
    const host = mountOfficialAccountsHost(bench)
    host.readController()
    expect(getSdkworkGlobalTokenManager().getAccessToken()).toBe('env-access-token')
    host.dispose()
  })

  it('publishes environment and session changes and stops after dispose', () => {
    const bench = harness({ baseUrl: 'https://gateway.example' })
    const host = mountOfficialAccountsHost(bench)
    const seen: number[] = []
    const off = host.subscribe(() => { seen.push(seen.length) })
    bench.setEnvironment({ baseUrl: 'https://other.example' })
    bench.setEnvironment({ session: { accessToken: 'token' } })
    expect(seen).toHaveLength(2)

    host.dispose()
    const afterDispose = seen.length
    bench.setEnvironment({ baseUrl: 'https://third.example' })
    expect(seen).toHaveLength(afterDispose)
    off()
  })
})
