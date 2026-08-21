// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  createCourseHostRuntime,
  toCourseSession,
  type CourseHostEnvironment,
  type CourseHostIam,
  type CourseHostLocale,
} from '../src/client/courseHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toCourseSession>[0]
  language?: string
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  const env: CourseHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: CourseHostIam = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: CourseHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  const theme = {
    getColorScheme: () => 'dark' as const,
    subscribe: () => () => {},
  }
  return {
    env,
    iam,
    locale,
    theme,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
  }
}

describe('toCourseSession', () => {
  it('maps display name and avatar from the IAM session', () => {
    expect(toCourseSession({
      user: { displayName: 'Ada', avatar: 'avatar.png' },
    })).toEqual({
      user: { displayName: 'Ada', name: 'Ada', avatar: 'avatar.png' },
    })
  })

  it('falls back to email when display name is absent', () => {
    expect(toCourseSession({
      user: { email: 'ada@example.test' },
    })).toEqual({
      user: { displayName: 'ada@example.test', name: 'ada@example.test' },
    })
  })

  it('returns null when no profile fields are available', () => {
    expect(toCourseSession(null)).toBeNull()
    expect(toCourseSession({ user: { avatar: 42 } })).toBeNull()
  })
})

describe('Course host runtime', () => {
  afterEach(() => {
    resetSdkworkGlobalTokenManager()
  })

  it('tracks host subscriptions and remounts on environment changes', () => {
    const h = harness({ session: { accessToken: 'session-access', user: { displayName: 'Ada' } } })
    const adapter = createCourseHostRuntime(h)
    const changes: number[] = []
    adapter.subscribe(() => { changes.push(adapter.getEnvironmentRevision()) })
    const dispose = adapter.start()
    expect(adapter.readHostSession()).toEqual({ user: { displayName: 'Ada', name: 'Ada' } })
    h.fireIam()
    expect(changes).toEqual([0])
    h.fireEnvironment()
    expect(changes).toEqual([0, 1])
    dispose()
    h.fireEnvironment()
    expect(changes).toEqual([0, 1])
  })

  it('syncs IAM session tokens into the global token manager', () => {
    const h = harness({
      accessToken: ' static ',
      session: { accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh' },
    })
    const adapter = createCourseHostRuntime(h)
    adapter.start()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
      refreshToken: 'session-refresh',
    })
    adapter.dispose()
  })

  it('maps locale subscriptions to SDKWork language tags', () => {
    const h = harness({ language: 'en' })
    const adapter = createCourseHostRuntime(h)
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
    const adapter = createCourseHostRuntime(h)
    adapter.start()
    expect(adapter.resolveHostLanguage()).toBe('zh-CN')
    adapter.dispose()
    adapter.dispose()
    expect(adapter.getEnvironmentRevision()).toBe(0)
  })

  it('fails loud when no base URL is configured', () => {
    const h = harness({ baseUrl: '  ' })
    const adapter = createCourseHostRuntime(h)
    adapter.start()
    expect(() => adapter.ports().getCourseClient()).toThrow('ui-sdkwork-course: SDKWork base URL is not configured')
    adapter.dispose()
  })
})
