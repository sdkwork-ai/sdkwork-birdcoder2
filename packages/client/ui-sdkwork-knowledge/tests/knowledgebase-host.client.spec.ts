import { afterEach, describe, expect, it } from 'vitest'
import { getKnowledgebasePcSdkPorts } from '@sdkwork/knowledgebase-pc-knowledge'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  configureKnowledgebaseHost,
  createKnowledgebaseHostRuntime,
  toKnowledgebaseSession,
  type KnowledgebaseHostEnvironment,
  type KnowledgebaseHostIam,
  type KnowledgebaseHostLocale,
  type KnowledgebaseHostTheme,
} from '../src/client/knowledgebaseHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toKnowledgebaseSession>[0]
  language?: string
  colorScheme?: 'light' | 'dark'
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  let themeListener: (() => void) | undefined
  const env: KnowledgebaseHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: KnowledgebaseHostIam = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: KnowledgebaseHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  const theme: KnowledgebaseHostTheme = {
    getColorScheme: () => initial.colorScheme ?? 'light',
    subscribe: (listener) => {
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

describe('toKnowledgebaseSession', () => {
  it('maps credentials and user profile with the host identity context as fallback', () => {
    expect(toKnowledgebaseSession({
      accessToken: ' access ',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada', email: 'ada@example.test', avatar: 'avatar' },
      context: { tenantId: 'tenant', userId: 'user', organizationId: 'org', deploymentMode: 'cloud' },
    }, '')).toEqual({
      accessToken: 'access',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada', email: 'ada@example.test', avatarUrl: 'avatar' },
      context: { tenantId: 'tenant', userId: 'user', organizationId: 'org', iamDeploymentMode: 'cloud' },
    })
  })

  it('requires usable credentials and keeps auth-only sessions', () => {
    expect(toKnowledgebaseSession(null, '')).toBeNull()
    expect(toKnowledgebaseSession({ accessToken: 'token', user: { displayName: 'No id' } }, '')).toEqual({ accessToken: 'token' })
    expect(toKnowledgebaseSession({ authToken: 'auth', user: { id: 'user' } }, '')).toEqual({
      authToken: 'auth',
      user: { id: 'user' },
    })
  })

  it('prefers IAM session tokens over env bootstrap access token', () => {
    const bootstrapToken = 'header.payload.signature'
    expect(toKnowledgebaseSession({
      accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh',
    }, bootstrapToken)).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
      refreshToken: 'session-refresh',
    })
  })

  it('falls back to env bootstrap access token when IAM session has no access token', () => {
    const bootstrapToken = 'header.payload.signature'
    expect(toKnowledgebaseSession({ authToken: 'auth' }, bootstrapToken)).toEqual({
      accessToken: bootstrapToken,
      authToken: 'auth',
    })
  })
})

describe('Knowledgebase host runtime', () => {
  afterEach(() => {
    resetSdkworkGlobalTokenManager()
  })

  it('tracks host subscriptions and remounts on environment changes', () => {
    const h = harness({ session: { accessToken: 'session-access', authToken: 'session-auth' } })
    const adapter = createKnowledgebaseHostRuntime(h)
    const changes: number[] = []
    adapter.subscribe(() => { changes.push(adapter.getEnvironmentRevision()) })
    const dispose = adapter.start()
    expect(adapter.readHostSession()).toEqual({ accessToken: 'session-access', authToken: 'session-auth' })
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
    })
    h.fireEnvironment()
    expect(changes).toEqual([1])
    dispose()
    h.fireEnvironment()
    expect(changes).toEqual([1])
  })

  it('shares the host token manager with the embedded runtime', () => {
    const h = harness({ session: { accessToken: 'session-access', authToken: 'session-auth' } })
    const adapter = configureKnowledgebaseHost({
      env: h.env,
      iam: h.iam,
      locale: h.locale,
      theme: h.theme,
    })
    try {
      expect(getKnowledgebasePcSdkPorts().getTokenManager?.()).toBe(getSdkworkGlobalTokenManager())
    } finally {
      adapter.dispose()
    }
  })

  it('maps locale subscriptions to SDKWork language tags', () => {
    const h = harness({ language: 'en' })
    const adapter = createKnowledgebaseHostRuntime(h)
    const languages: string[] = []
    adapter.start()
    adapter.subscribeHostLanguage((language) => { languages.push(language) })
    expect(adapter.resolveHostLanguage()).toBe('en-US')
    h.fireLocale()
    expect(languages).toEqual(['en-US'])
    adapter.dispose()
  })

  it('maps theme subscriptions to host color-scheme tags', () => {
    const h = harness({ colorScheme: 'dark' })
    const adapter = createKnowledgebaseHostRuntime(h)
    expect(adapter.resolveHostColorScheme()).toBe('dark')
  })

  it('keys the surface by the signed-in identity so an account switch remounts it', () => {
    const h = harness({
      session: { accessToken: 'token-a', context: { tenantId: 'tenant', userId: 'user-a' } },
    })
    const adapter = createKnowledgebaseHostRuntime(h)
    adapter.start()
    expect(adapter.getIdentityKey()).toBe('tenant:user-a')

    h.iam.controller.getState = () => ({
      session: { accessToken: 'token-b', context: { tenantId: 'tenant', userId: 'user-b' } },
    })
    h.fireIam()
    expect(adapter.getIdentityKey()).toBe('tenant:user-b')
    expect(adapter.getEnvironmentRevision()).toBe(0)
    adapter.dispose()
  })

  it('requires both a tenant and a user before an identity key exists', () => {
    const tenantOnly = createKnowledgebaseHostRuntime(harness({
      session: { accessToken: 'token', user: { id: 'user-a' }, context: { tenantId: 'tenant' } },
    }))
    expect(tenantOnly.getIdentityKey()).toBe('')
    expect(createKnowledgebaseHostRuntime(harness({})).getIdentityKey()).toBe('')
  })
})
