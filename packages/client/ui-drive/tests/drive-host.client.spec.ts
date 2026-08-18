import { describe, expect, it } from 'vitest'
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
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
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
  return {
    env,
    iam,
    locale,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
  }
}

describe('toDriveSession', () => {
  it('maps credentials and complete identity context', () => {
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
      context: {
        tenantId: 'tenant', userId: 'user', organizationId: 'org', sessionId: 'context-session',
        appId: 'app', environment: 'prod', deploymentMode: 'cloud', authLevel: 'tenant',
        dataScope: ['tenant'], permissionScope: ['drive.read'], actorId: 'actor',
        actorKind: 'user', deviceId: 'device',
      },
    })
  })

  it('drops non-string avatars and null organization ids', () => {
    expect(toDriveSession({
      accessToken: 'token',
      user: { id: 'user', avatar: 42 },
      context: { tenantId: 'tenant', userId: 'user', organizationId: null },
    }, '')).toEqual({
      accessToken: 'token',
      user: { id: 'user' },
      context: { tenantId: 'tenant', userId: 'user' },
    })
  })

  it('requires usable credentials and complete context referents', () => {
    expect(toDriveSession(null, '')).toBeNull()
    expect(toDriveSession({ accessToken: 'token', user: { displayName: 'No id' } }, '')).toEqual({ accessToken: 'token' })
    expect(toDriveSession({ authToken: 'auth', user: { id: 'user' }, context: { tenantId: 'tenant' } }, '')).toEqual({
      authToken: 'auth',
      user: { id: 'user' },
      context: { tenantId: 'tenant', userId: 'user' },
    })
  })

  it('uses the static access token without copying session credentials', () => {
    expect(toDriveSession({
      accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh',
    }, ' static ')).toEqual({ accessToken: 'static' })
  })
})

describe('Drive host runtime', () => {
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

  it('syncs the static access token ahead of session credentials', () => {
    const h = harness({
      accessToken: ' static ',
      session: { accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh' },
    })
    const adapter = createDriveHostRuntime(h)
    adapter.start()
    expect(adapter.readHostSession()).toEqual({ accessToken: 'static' })
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
