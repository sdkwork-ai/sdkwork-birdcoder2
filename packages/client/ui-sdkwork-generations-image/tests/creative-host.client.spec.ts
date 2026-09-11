import { describe, expect, it, vi } from 'vitest'
import {
  createCreativeHostRuntime,
  createCreativeInterceptors,
  normalizeCreativeGatewayBaseUrl,
  toCreativeSession,
  type CreativeHostEnvironment,
  type CreativeHostIam,
  type CreativeHostLocale,
} from '../src/client/creativeHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  appId?: string
  session?: Parameters<typeof toCreativeSession>[0]
  language?: string
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let baseUrl = initial.baseUrl ?? 'https://fixture.example'
  const env: CreativeHostEnvironment = {
    apiBaseUrl: () => baseUrl,
    accessToken: () => initial.accessToken ?? '',
    appId: () => initial.appId ?? 'birdcoder-app',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: CreativeHostIam = {
    isSignedIn: () => (initial.session ?? null) !== null,
    requestSignIn: async () => true,
    requireSignedIn: async () => {},
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: CreativeHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: () => () => {},
  }
  return {
    env,
    iam,
    locale,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    setBaseUrl: (next: string) => { baseUrl = next },
  }
}

describe('normalizeCreativeGatewayBaseUrl', () => {
  it('strips a duplicated app API suffix', () => {
    expect(normalizeCreativeGatewayBaseUrl('https://fixture.example/app/v3/api'))
      .toBe('https://fixture.example')
  })
})

describe('toCreativeSession', () => {
  it('maps IAM credentials and user fields', () => {
    expect(toCreativeSession({
      accessToken: ' access ',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada', email: 'ada@example.test', avatar: 'avatar' },
    }, '')).toEqual({
      accessToken: 'access',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada', email: 'ada@example.test', avatar: 'avatar' },
    })
  })

  it('prefers the IAM access token over the static bootstrap token', () => {
    expect(toCreativeSession({ accessToken: 'iam-access', authToken: 'auth' }, 'bootstrap')).toEqual({
      accessToken: 'iam-access',
      authToken: 'auth',
    })
  })

  it('uses the static bootstrap token when IAM has no access token', () => {
    expect(toCreativeSession(null, ' bootstrap ')).toEqual({ accessToken: 'bootstrap' })
  })

  it('requires usable credentials', () => {
    expect(toCreativeSession(null, '')).toBeNull()
  })
})

describe('createCreativeInterceptors', () => {
  it('appends the deferred sign-in gate after the Agents PC context interceptors', () => {
    const interceptors = createCreativeInterceptors(
      { isSignedIn: () => true, requireSignedIn: async () => {} },
      () => null,
    )
    expect(interceptors.request).toHaveLength(2)
    expect(interceptors.response).toEqual([])
    expect(interceptors.error).toEqual([])
  })

  it('holds a user-initiated call for a session and lets the page read through', async () => {
    // The page loads its own reads while signed out; only the request the user
    // asked for is worth interrupting with the overlay.
    const requireSignedIn = vi.fn(async () => {})
    const interceptors = createCreativeInterceptors(
      { isSignedIn: () => false, requireSignedIn },
      () => null,
    )
    const gate = interceptors.request[1]

    const mutation = { url: '/generations/images/text_to_image', method: 'POST' as const }
    await expect(gate(mutation)).resolves.toBe(mutation)
    expect(requireSignedIn).toHaveBeenCalledTimes(1)

    const read = { url: '/generations', method: 'GET' as const }
    await expect(gate(read)).resolves.toBe(read)
    expect(requireSignedIn).toHaveBeenCalledTimes(1)
  })
})

describe('createCreativeHostRuntime', () => {
  it('bumps the environment revision when the base URL changes', () => {
    const { env, iam, locale, fireEnvironment, setBaseUrl } = harness({ baseUrl: 'https://one.example' })
    const runtime = createCreativeHostRuntime({ env, iam, locale })
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    setBaseUrl('https://two.example')
    fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    runtime.dispose()
  })

  it('skips SDK client wiring when the environment is unconfigured', () => {
    const { env, iam, locale } = harness({ baseUrl: '' })
    const runtime = createCreativeHostRuntime({ env, iam, locale })
    expect(() => runtime.start()).not.toThrow()
    runtime.dispose()
  })
})
