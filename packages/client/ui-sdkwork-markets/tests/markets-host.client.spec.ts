// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

vi.mock('@sdkwork/appstore-pc-embed', () => ({
  AppstoreMarketsSurface: () => null,
}))

import {
  configureMarketsHost,
  createMarketsHostRuntime,
  MarketsApp,
  toMarketsSession,
  type MarketsHostEnvironment,
  type MarketsHostIamFace,
  type MarketsHostLocale,
  type MarketsHostTheme,
} from '../src/client/marketsHost.ts'

/** Translate seat double: the dictionary key is its own copy. */
const t = (key: string): string => key

afterEach(() => { cleanup() })

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toMarketsSession>[0]
  language?: string
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  const env: MarketsHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const openSignIn = vi.fn()
  const iam: MarketsHostIamFace = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
    openSignIn,
  }
  const locale: MarketsHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  const theme: MarketsHostTheme = {
    getColorScheme: () => 'light',
    subscribe: () => () => {},
  }
  return {
    env, iam, locale, theme, openSignIn,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
  }
}

describe('toMarketsSession', () => {
  it('maps credentials and user profile, trimming tokens', () => {
    expect(toMarketsSession({
      accessToken: ' access ',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
    }, '')).toEqual({
      authToken: 'auth',
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
    })
  })

  it('falls back to the static environment token when no IAM session exists', () => {
    expect(toMarketsSession(null, ' static ')).toEqual({ accessToken: 'static' })
  })

  it('returns null when neither session nor static token carries credentials', () => {
    expect(toMarketsSession(null, '')).toBeNull()
    expect(toMarketsSession({ user: { id: 'u' } }, '')).toBeNull()
  })
})

describe('MarketsHostRuntime', () => {
  it('reads the composed snapshot from env, iam, and locale', () => {
    const h = harness({
      baseUrl: 'https://gw.example',
      accessToken: 'static-token',
      session: { accessToken: 'iam-token', user: { id: 'u1' } },
      language: 'zh',
    })
    const runtime = createMarketsHostRuntime(h)
    const snapshot = runtime.getHostSnapshot()
    expect(snapshot.apiBaseUrl).toBe('https://gw.example')
    // An IAM session supersedes the static token (no accessToken prop).
    expect(snapshot.accessToken).toBe('')
    expect(snapshot.session?.accessToken).toBe('iam-token')
    expect(snapshot.locale).toBe('zh-CN')
    expect(snapshot.environmentRevision).toBe(0)
  })

  it('serves the static token when anonymous', () => {
    const h = harness({ baseUrl: 'https://gw.example', accessToken: 'static' })
    const runtime = createMarketsHostRuntime(h)
    runtime.start()
    const snapshot = runtime.getHostSnapshot()
    expect(snapshot.accessToken).toBe('static')
    // With no IAM session the static token rides the session snapshot
    // (toMarketsSession(null, 'static') → { accessToken: 'static' }).
    expect(snapshot.session).toEqual({ accessToken: 'static' })
    runtime.dispose()
  })

  it('caches the snapshot until an input changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    runtime.start()
    const first = runtime.getHostSnapshot()
    expect(runtime.getHostSnapshot()).toBe(first)
    h.fireLocale()
    expect(runtime.getHostSnapshot()).not.toBe(first)
    runtime.dispose()
  })

  it('bumps the environment revision on environment changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    h.fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    runtime.dispose()
  })

  it('notifies subscribers and stops after disposal', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    const listener = vi.fn()
    const stop = runtime.start()
    runtime.subscribe(listener)
    h.fireIam()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    h.fireIam()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports whether the surface holds credentials to call app-api', () => {
    const anonymous = createMarketsHostRuntime(harness({ baseUrl: 'https://gw.example' }))
    expect(anonymous.getHostSnapshot().authenticated).toBe(false)
    const session = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'iam-token' },
    }))
    expect(session.getHostSnapshot().authenticated).toBe(true)
    // The static environment token authenticates the surface without an IAM
    // session: those deployments keep their catalog and never see the gate.
    const statically = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      accessToken: 'static-token',
    }))
    expect(statically.getHostSnapshot().authenticated).toBe(true)
  })

  it('hands the sign-in gesture to the application login entry', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    runtime.requestSignIn()
    expect(h.openSignIn).toHaveBeenCalledOnce()
  })
})

describe('MarketsApp', () => {
  it('renders the sign-in face while the host holds no credentials', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const adapter = configureMarketsHost(h)
    const view = render(createElement(MarketsApp, { page: 'experts', t }))
    expect(view.container.querySelector('[data-markets-auth-required="true"]')).not.toBeNull()
    expect(view.getByText('surface.auth.title')).not.toBeNull()
    expect(view.getByText('surface.auth.detail')).not.toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'surface.auth.action' }))
    expect(h.openSignIn).toHaveBeenCalledOnce()
    // The catalog never mounts for a request that app-api would refuse.
    expect(view.container.querySelector('[data-sdk-surface]')).toBeNull()
    adapter.dispose()
  })

  it('mounts the catalog once the host holds a session', () => {
    const h = harness({ baseUrl: 'https://gw.example', session: { accessToken: 'iam-token' } })
    const adapter = configureMarketsHost(h)
    const view = render(createElement(MarketsApp, { page: 'experts', t }))
    expect(view.container.querySelector('[data-markets-auth-required]')).toBeNull()
    expect(view.container.querySelector('[data-sdk-surface="markets-experts"]')).not.toBeNull()
    adapter.dispose()
  })

  it('keeps the unconfigured face ahead of the sign-in face', () => {
    const adapter = configureMarketsHost(harness({ baseUrl: '' }))
    const view = render(createElement(MarketsApp, { page: 'plugins', t }))
    expect(view.container.querySelector('[data-markets-empty="unconfigured"]')).not.toBeNull()
    expect(view.container.querySelector('[data-markets-auth-required]')).toBeNull()
    adapter.dispose()
  })
})
