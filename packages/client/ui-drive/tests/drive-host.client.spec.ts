import { afterEach, describe, expect, it } from 'vitest'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-iam/sdkwork-global-token-manager'
import {
  createDriveHostRuntime,
  toDriveSession,
  type DriveHostEnvironment,
  type DriveHostIam,
  type DriveHostLocale,
} from '../src/client/driveHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toDriveSession>[0]
  language?: string
  colorScheme?: 'light' | 'dark'
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  let themeListener: (() => void) | undefined
  const env: DriveHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: DriveHostIam = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: DriveHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  const theme = {
    getColorScheme: () => initial.colorScheme ?? 'light',
    subscribe: (listener: () => void) => {
      themeListener = listener
      return () => { themeListener = undefined }
    },
  }
  return {
    env,
    iam,
    locale,
    theme,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
    fireTheme: () => { themeListener?.() },
  }
}

describe('toDriveSession', () => {
  it('maps credentials and user profile without host identity context', () => {
    expect(toDriveSession({
      accessToken: ' access ',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada', email: 'ada@example.test', avatar: 'avatar' },
      context: {
        tenantId: 'tenant', userId: 'user', organizationId: 'org', sessionId: 'context-session',
        appId: 'app', environment: 'prod', deploymentMode: 'cloud', authLevel: 'tenant',
        dataScope: ['tenant'], permissionScope: ['drive.read'], actorId: 'actor',
        actorKind: 'user', deviceId: 'device',
      },
    }, '')).toEqual({
      accessToken: 'access',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada', email: 'ada@example.test', avatarUrl: 'avatar' },
    })
  })

  it('drops non-string avatars and omits IAM context fields', () => {
    expect(toDriveSession({
      accessToken: 'token',
      user: { id: 'user', avatar: 42 },
      context: { tenantId: 'tenant', userId: 'user', organizationId: null },
    }, '')).toEqual({
      accessToken: 'token',
      user: { id: 'user' },
    })
  })

  it('requires usable credentials and keeps auth-only sessions', () => {
    expect(toDriveSession(null, '')).toBeNull()
    expect(toDriveSession({ accessToken: 'token', user: { displayName: 'No id' } }, '')).toEqual({ accessToken: 'token' })
    expect(toDriveSession({ authToken: 'auth', user: { id: 'user' } }, '')).toEqual({
      authToken: 'auth',
      user: { id: 'user' },
    })
  })

  it('falls back to env bootstrap access token when IAM session has no access token', () => {
    const bootstrapToken = 'header.payload.signature'
    expect(toDriveSession(null, bootstrapToken)).toEqual({ accessToken: bootstrapToken })
  })

  it('prefers IAM session tokens over env bootstrap access token', () => {
    const bootstrapToken = 'header.payload.signature'
    expect(toDriveSession({
      accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh',
    }, bootstrapToken)).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
      refreshToken: 'session-refresh',
    })
  })
})

describe('Drive host runtime', () => {
  afterEach(() => {
    resetSdkworkGlobalTokenManager()
  })

  it('tracks host subscriptions and remounts on environment changes', () => {
    const h = harness({ session: { accessToken: 'session-access', authToken: 'session-auth' } })
    const adapter = createDriveHostRuntime(h)
    const changes: number[] = []
    adapter.subscribe(() => { changes.push(adapter.getEnvironmentRevision()) })
    const dispose = adapter.start()
    expect(adapter.readHostSession()).toEqual({ accessToken: 'session-access', authToken: 'session-auth' })
    h.fireIam()
    expect(changes).toEqual([0])
    h.fireEnvironment()
    expect(changes).toEqual([0, 1])
    dispose()
    h.fireEnvironment()
    expect(changes).toEqual([0, 1])
  })

  it('syncs IAM session tokens ahead of env bootstrap access token', () => {
    const h = harness({
      accessToken: ' static ',
      session: { accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh' },
    })
    const adapter = createDriveHostRuntime(h)
    adapter.start()
    expect(adapter.readHostSession()).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
      refreshToken: 'session-refresh',
    })
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
      refreshToken: 'session-refresh',
    })
    adapter.dispose()
  })

  it('fills access token from env when IAM session only has authToken', () => {
    const h = harness({ accessToken: 'env-access', session: { authToken: 'auth' } })
    const adapter = createDriveHostRuntime(h)
    adapter.start()
    expect(adapter.readHostSession()).toEqual({ accessToken: 'env-access', authToken: 'auth' })
    adapter.dispose()
  })

  it('keeps a session without an access token when only auth tokens exist', () => {
    const h = harness({ session: { authToken: 'auth', refreshToken: 'refresh' } })
    const adapter = createDriveHostRuntime(h)
    adapter.start()
    expect(adapter.readHostSession()).toEqual({ authToken: 'auth', refreshToken: 'refresh' })
    adapter.dispose()
  })

  it('clears tokens when signed out', () => {
    const h = harness({})
    const adapter = createDriveHostRuntime(h)
    adapter.start()
    expect(adapter.readHostSession()).toBeNull()
    adapter.dispose()
  })

  it('maps locale subscriptions to SDKWork language tags', () => {
    const h = harness({ language: 'en' })
    const adapter = createDriveHostRuntime(h)
    const languages: string[] = []
    adapter.start()
    adapter.subscribeHostLanguage((language) => { languages.push(language) })
    expect(adapter.resolveHostLanguage()).toBe('en-US')
    h.fireLocale()
    expect(languages).toEqual(['en-US'])
    adapter.dispose()
  })

  it('maps theme subscriptions to SDKWork color-scheme tags', () => {
    const h = harness({ colorScheme: 'dark' })
    const adapter = createDriveHostRuntime(h)
    const schemes: Array<'light' | 'dark'> = []
    adapter.start()
    adapter.subscribeHostColorScheme((scheme) => { schemes.push(scheme) })
    expect(adapter.resolveHostColorScheme()).toBe('dark')
    h.fireTheme()
    expect(schemes).toEqual(['dark'])
    adapter.dispose()
  })

  it('resolves the Chinese locale tag and disposes idempotently', () => {
    const h = harness({ language: 'zh' })
    const adapter = createDriveHostRuntime(h)
    adapter.start()
    expect(adapter.resolveHostLanguage()).toBe('zh-CN')
    adapter.dispose()
    adapter.dispose()
    expect(adapter.getEnvironmentRevision()).toBe(0)
  })

  it('stops publishing after the start disposer runs', () => {
    const h = harness({ session: { accessToken: 'session-access' } })
    const adapter = createDriveHostRuntime(h)
    const changes: number[] = []
    adapter.subscribe(() => { changes.push(adapter.getEnvironmentRevision()) })
    const dispose = adapter.start()
    expect(adapter.readHostSession()).toEqual({ accessToken: 'session-access' })
    dispose()
    h.fireEnvironment()
    h.fireIam()
    expect(changes).toEqual([])
  })
})
