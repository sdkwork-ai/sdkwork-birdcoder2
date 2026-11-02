import { describe, expect, it, vi } from 'vitest'
import {
  createCreativeHostRuntime,
  createCreativeInterceptors,
  normalizeCreativeGatewayBaseUrl,
  readCreativeIdentityKey,
  toCreativeSession,
  type ConfigureCreativeHostOptions,
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
  let session: Parameters<typeof toCreativeSession>[0] = initial.session ?? null
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
    isSignedIn: () => session !== null,
    requestSignIn: async () => true,
    requireSignedIn: async () => {},
    controller: {
      getState: () => ({ session }),
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
  const theme = {
    getColorScheme: () => 'light' as const,
    subscribe: () => () => {},
  }
  const options: ConfigureCreativeHostOptions = { env, iam, locale, theme }
  return {
    env,
    iam,
    locale,
    theme,
    options,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    setBaseUrl: (next: string) => { baseUrl = next },
    setSession: (next: Parameters<typeof toCreativeSession>[0]) => { session = next },
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

describe('readCreativeIdentityKey', () => {
  const account = {
    accessToken: 'access-1',
    authToken: 'auth-1',
    sessionId: 'session-1',
    user: { id: 'user-a' },
    context: { tenantId: 'tenant-1', organizationId: 'org-1' },
  }

  it('keeps a token refresh inside the same account', () => {
    const refreshed = { ...account, accessToken: 'access-2', authToken: 'auth-2', sessionId: 'session-2' }
    expect(readCreativeIdentityKey(refreshed)).toBe(readCreativeIdentityKey(account))
  })

  it('separates two accounts of the same tenant', () => {
    const other = { ...account, user: { id: 'user-b' } }
    expect(readCreativeIdentityKey(other)).not.toBe(readCreativeIdentityKey(account))
  })

  it('falls back to the token-context user id', () => {
    expect(readCreativeIdentityKey({
      accessToken: 'access',
      authToken: 'auth',
      context: { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-a' },
    })).toBe(readCreativeIdentityKey(account))
  })

  it('tells every signed-in session apart from signed out', () => {
    expect(readCreativeIdentityKey(null)).toBe('')
    // A session without identity claims still differs from signed out, so a
    // sign-in after sign-out always remounts the surface.
    expect(readCreativeIdentityKey({ accessToken: 'access', authToken: 'auth' })).not.toBe('')
  })
})

describe('createCreativeHostRuntime', () => {
  it('bumps both revisions when the base URL changes', () => {
    const { env, iam, locale, theme, fireEnvironment, setBaseUrl } = harness({ baseUrl: 'https://one.example' })
    const runtime = createCreativeHostRuntime({ env, iam, locale, theme })
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    expect(runtime.getSurfaceRevision()).toBe(0)
    setBaseUrl('https://two.example')
    fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    expect(runtime.getSurfaceRevision()).toBe(1)
    runtime.dispose()
  })

  it('remounts the embedded surface when the signed-in account changes', () => {
    // The creative view lists account-scoped server sessions and loads them
    // once on mount; without a new key the previous account's list survives the
    // sign-out and the next sign-in.
    const h = harness({ session: { accessToken: 'a-1', authToken: 'b-1', user: { id: 'user-a' } } })
    const runtime = createCreativeHostRuntime(h.options)
    runtime.start()
    expect(runtime.getSurfaceRevision()).toBe(0)

    h.setSession({ accessToken: 'a-2', authToken: 'b-2', user: { id: 'user-b' } })
    h.fireIam()

    expect(runtime.getSurfaceRevision()).toBe(1)
    expect(runtime.getEnvironmentRevision()).toBe(0)
    runtime.dispose()
  })

  it('keeps the embedded surface mounted through a token refresh of one account', () => {
    const h = harness({ session: { accessToken: 'a-1', authToken: 'b-1', user: { id: 'user-a' } } })
    const runtime = createCreativeHostRuntime(h.options)
    runtime.start()

    h.setSession({ accessToken: 'a-2', authToken: 'b-2', user: { id: 'user-a' } })
    h.fireIam()

    expect(runtime.getSurfaceRevision()).toBe(0)
    runtime.dispose()
  })

  it('remounts the embedded surface when the session ends', () => {
    const h = harness({ session: { accessToken: 'a-1', authToken: 'b-1', user: { id: 'user-a' } } })
    const runtime = createCreativeHostRuntime(h.options)
    runtime.start()

    h.setSession(null)
    h.fireIam()

    expect(runtime.getSurfaceRevision()).toBe(1)
    runtime.dispose()
  })

  it('skips SDK client wiring when the environment is unconfigured', () => {
    const { env, iam, locale, theme } = harness({ baseUrl: '' })
    const runtime = createCreativeHostRuntime({ env, iam, locale, theme })
    expect(() => runtime.start()).not.toThrow()
    runtime.dispose()
  })
})
