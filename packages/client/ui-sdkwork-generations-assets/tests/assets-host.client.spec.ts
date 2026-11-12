// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  createAssetsHostRuntime,
  normalizeAssetsGatewayBaseUrl,
  toAssetsSession,
  type AssetsHostEnvironment,
  type AssetsHostIam,
  type AssetsHostLocale,
  type AssetsHostTheme,
} from '../src/client/assetsHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toAssetsSession>[0]
  language?: string
  colorScheme?: 'light' | 'dark'
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let baseUrl = initial.baseUrl ?? 'https://fixture.example'
  const env: AssetsHostEnvironment = {
    apiBaseUrl: () => baseUrl,
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: AssetsHostIam = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: AssetsHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: () => () => {},
  }
  const theme: AssetsHostTheme = {
    getColorScheme: () => initial.colorScheme ?? 'light',
    subscribe: () => () => {},
  }
  return {
    env,
    iam,
    locale,
    theme,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    setBaseUrl: (next: string) => { baseUrl = next },
  }
}

describe('normalizeAssetsGatewayBaseUrl', () => {
  it('strips a duplicated app API suffix', () => {
    expect(normalizeAssetsGatewayBaseUrl('https://fixture.example/app/v3/api'))
      .toBe('https://fixture.example')
  })
})

describe('toAssetsSession', () => {
  it('maps IAM credentials and user fields', () => {
    expect(toAssetsSession({
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
    expect(toAssetsSession({ accessToken: 'iam-access', authToken: 'auth' }, 'bootstrap')).toEqual({
      accessToken: 'iam-access',
      authToken: 'auth',
    })
  })

  it('forwards the signed-in identity context the Agents PC store scopes by', () => {
    expect(toAssetsSession({
      accessToken: 'access',
      authToken: 'auth',
      user: { id: 'user' },
      context: {
        appId: 'sdkwork-birdcoder',
        tenantId: 'tenant',
        userId: 'user',
        organizationId: 'org',
        sessionId: 'context-session',
      },
    }, '')).toEqual({
      accessToken: 'access',
      authToken: 'auth',
      user: { id: 'user' },
      context: {
        appId: 'sdkwork-birdcoder',
        tenantId: 'tenant',
        userId: 'user',
        organizationId: 'org',
        sessionId: 'context-session',
      },
    })
    // The Agents PC context requires the application id: a partial context is
    // dropped instead of writing a half-applicable account scope.
    expect(toAssetsSession({
      accessToken: 'access',
      authToken: 'auth',
      context: { tenantId: 'tenant', userId: 'user' },
    }, '')).toEqual({ accessToken: 'access', authToken: 'auth' })
  })
})

describe('AssetsHostRuntime', () => {
  it('remounts after an environment switch and maps locale tags', () => {
    const fixture = harness({ baseUrl: 'https://first.example', language: 'en' })
    const runtime = createAssetsHostRuntime(fixture)
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    expect(runtime.resolveHostLanguage()).toBe('en-US')

    fixture.fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    runtime.dispose()
  })

  it('keys the surface by the signed-in identity so an account switch remounts it', () => {
    const fixture = harness({
      session: { accessToken: 'token-a', context: { appId: 'app', tenantId: 'tenant', userId: 'user-a' } },
    })
    const runtime = createAssetsHostRuntime(fixture)
    runtime.start()
    expect(runtime.getIdentityKey()).toBe('tenant:user-a')

    fixture.iam.controller.getState = () => ({
      session: { accessToken: 'token-b', context: { appId: 'app', tenantId: 'tenant', userId: 'user-b' } },
    })
    fixture.fireIam()
    expect(runtime.getIdentityKey()).toBe('tenant:user-b')
    expect(runtime.getEnvironmentRevision()).toBe(0)
    runtime.dispose()
  })

  it('falls back to the profile id and reads an anonymous session as no identity', () => {
    const signedIn = createAssetsHostRuntime(harness({
      session: { accessToken: 'token', user: { id: 'user-a' }, context: { tenantId: 'tenant' } },
    }))
    expect(signedIn.getIdentityKey()).toBe('tenant:user-a')
    expect(createAssetsHostRuntime(harness({})).getIdentityKey()).toBe('')
  })
})
