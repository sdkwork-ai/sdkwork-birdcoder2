import { describe, expect, it } from 'vitest'
import {
  createCreativeHostRuntime,
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
