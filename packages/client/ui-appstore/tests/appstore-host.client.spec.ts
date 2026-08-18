import { describe, expect, it } from 'vitest'
import {
  createAppstoreHostRuntime,
  toAppstoreSession,
  type AppstoreHostEnvironment,
  type AppstoreHostIam,
  type AppstoreHostLocale,
} from '../src/client/appstoreHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toAppstoreSession>[0]
  language?: string
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  const env: AppstoreHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: AppstoreHostIam = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: AppstoreHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  return {
    env,
    iam,
    locale,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
  }
}

describe('toAppstoreSession', () => {
  it('maps credentials and complete identity context', () => {
    expect(toAppstoreSession({
      accessToken: ' access ',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
      context: { tenantId: 'tenant', userId: 'user', organizationId: 'org', deploymentMode: 'cloud' },
    }, '')).toEqual({
      accessToken: 'access',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
      context: { tenantId: 'tenant', userId: 'user', organizationId: 'org', deploymentMode: 'cloud' },
    })
  })

  it('requires usable credentials and complete context referents', () => {
    expect(toAppstoreSession(null, '')).toBeNull()
    expect(toAppstoreSession({ accessToken: 'token', user: { displayName: 'No id' } }, '')).toEqual({
      accessToken: 'token',
      user: { displayName: 'No id' },
    })
    expect(toAppstoreSession({ authToken: 'auth', user: { id: 'user' }, context: { tenantId: 'tenant' } }, '')).toEqual({
      authToken: 'auth',
      user: { id: 'user' },
      context: { tenantId: 'tenant', userId: 'user' },
    })
  })

  it('prefers the static environment access token over IAM credentials', () => {
    expect(toAppstoreSession({
      accessToken: 'iam-access',
      authToken: 'iam-auth',
      refreshToken: 'iam-refresh',
    }, ' static ')).toEqual({ accessToken: 'static' })
  })
})

describe('AppstoreHostRuntime', () => {
  it('remounts after an environment switch and maps locale tags', () => {
    const fixture = harness({ baseUrl: 'https://first.example', language: 'en' })
    const runtime = createAppstoreHostRuntime(fixture)
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    expect(runtime.resolveHostLanguage()).toBe('en-US')
    expect(runtime.getHostSnapshot()).toMatchObject({
      apiBaseUrl: 'https://first.example',
      locale: 'en-US',
    })

    fixture.fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    runtime.dispose()
  })

  it('publishes IAM and locale changes without remounting', () => {
    const fixture = harness({ session: { accessToken: 'token-a' } })
    const runtime = createAppstoreHostRuntime(fixture)
    runtime.start()
    expect(runtime.readHostSession()).toEqual({ accessToken: 'token-a' })

    fixture.iam.controller.getState = () => ({ session: { accessToken: 'token-b' } })
    fixture.fireIam()
    expect(runtime.readHostSession()).toEqual({ accessToken: 'token-b' })
    expect(runtime.getEnvironmentRevision()).toBe(0)

    fixture.locale.getSnapshot = () => ({ active: 'zh' })
    fixture.fireLocale()
    expect(runtime.resolveHostLanguage()).toBe('zh-CN')
    runtime.dispose()
  })
})
