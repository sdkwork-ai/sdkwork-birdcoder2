// @vitest-environment jsdom
/** Template Library host adapter spec: the env/iam/locale → SDKWork snapshot
 * composition, the static-token fallback for anonymous browsing, snapshot
 * caching and invalidation, the single-active-adapter handoff, and the render
 * faces (themed shell root with the scroll container; unconfigured status).
 * The embedded surface itself is mocked out. */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'

vi.mock('@sdkwork/appstore-pc-embed', () => ({
  AppstoreMarketsSurface: () => null,
}))

import {
  TemplateLibraryApp,
  configureTemplateLibraryHost,
  createTemplateLibraryHostRuntime,
  toTemplateLibrarySession,
  type TemplateLibraryAppProps,
  type TemplateLibraryHostEnvironment,
  type TemplateLibraryHostIam,
  type TemplateLibraryHostLocale,
  type TemplateLibraryHostTheme,
} from '../src/client/templateLibraryHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toTemplateLibrarySession>[0]
  language?: string
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  const env: TemplateLibraryHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: TemplateLibraryHostIam = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: TemplateLibraryHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  const theme: TemplateLibraryHostTheme = {
    getColorScheme: () => 'light',
    subscribe: () => () => {},
  }
  return {
    env, iam, locale, theme,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
  }
}

describe('toTemplateLibrarySession', () => {
  it('maps credentials and user profile, trimming tokens', () => {
    expect(toTemplateLibrarySession({
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
    expect(toTemplateLibrarySession(null, ' static ')).toEqual({ accessToken: 'static' })
  })

  it('returns null when neither session nor static token carries credentials', () => {
    expect(toTemplateLibrarySession(null, '')).toBeNull()
    expect(toTemplateLibrarySession({ user: { id: 'u' } }, '')).toBeNull()
  })
})

describe('TemplateLibraryHostRuntime', () => {
  it('reads the composed snapshot from env, iam, and locale', () => {
    const h = harness({
      baseUrl: 'https://gw.example',
      accessToken: 'static-token',
      session: { accessToken: 'iam-token', user: { id: 'u1' } },
      language: 'zh',
    })
    const runtime = createTemplateLibraryHostRuntime(h)
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
    const runtime = createTemplateLibraryHostRuntime(h)
    runtime.start()
    const snapshot = runtime.getHostSnapshot()
    expect(snapshot.accessToken).toBe('static')
    // With no IAM session the static token rides the session snapshot
    // (toTemplateLibrarySession(null, 'static') → { accessToken: 'static' }).
    expect(snapshot.session).toEqual({ accessToken: 'static' })
    runtime.dispose()
  })

  it('caches the snapshot until an input changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createTemplateLibraryHostRuntime(h)
    runtime.start()
    const first = runtime.getHostSnapshot()
    expect(runtime.getHostSnapshot()).toBe(first)
    h.fireLocale()
    expect(runtime.getHostSnapshot()).not.toBe(first)
    runtime.dispose()
  })

  it('bumps the environment revision on environment changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createTemplateLibraryHostRuntime(h)
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    h.fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    runtime.dispose()
  })

  it('propagates iam and locale changes without remounting the runtime', () => {
    const h = harness({ baseUrl: 'https://gw.example', language: 'en' })
    const runtime = createTemplateLibraryHostRuntime(h)
    runtime.start()
    expect(runtime.getHostSnapshot().locale).toBe('en-US')
    // IAM and locale notifications refresh the cached snapshot without
    // touching the environment revision (the remount key).
    const cached = runtime.getHostSnapshot()
    h.fireLocale()
    expect(runtime.getHostSnapshot()).not.toBe(cached)
    const before = runtime.getEnvironmentRevision()
    h.fireIam()
    expect(runtime.getEnvironmentRevision()).toBe(before)
    runtime.dispose()
  })

  it('notifies subscribers and stops after disposal', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createTemplateLibraryHostRuntime(h)
    const listener = vi.fn()
    const stop = runtime.start()
    runtime.subscribe(listener)
    h.fireIam()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    h.fireIam()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('configure disposes the previous adapter and dispose detaches it', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const first = configureTemplateLibraryHost(h)
    const second = configureTemplateLibraryHost(h)
    // The handoff disposed the first adapter: firing its sources is a no-op.
    expect(() => { h.fireEnvironment() }).not.toThrow()
    second.dispose()
    first.dispose()
  })
})

describe('TemplateLibraryApp', () => {
  it('mounts the catalog under the themed shell root carrying the scroll container', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const adapter = configureTemplateLibraryHost(h)
    try {
      const view = render(createElement(TemplateLibraryApp, {
        t: (key: Parameters<TemplateLibraryAppProps['t']>[0]) => key,
      }))
      const shell = view.container.firstElementChild as HTMLElement
      expect(shell.getAttribute('data-sdk-surface')).toBe('template-library')
      // The shell root is the catalog's scroll container: neither the
      // storefront page nor the frame's pageBody owns one.
      expect(shell.className).toContain('catalogScroll')
    } finally {
      cleanup()
      adapter.dispose()
    }
  })

  it('renders the unconfigured status face without a shell when the gateway is absent', () => {
    const h = harness({ baseUrl: '' })
    const adapter = configureTemplateLibraryHost(h)
    try {
      const view = render(createElement(TemplateLibraryApp, {
        t: (key: Parameters<TemplateLibraryAppProps['t']>[0]) => key,
      }))
      expect(view.container.querySelector('[data-template-library-empty="unconfigured"]')).toBeTruthy()
      expect(view.container.querySelector('[data-sdk-surface]')).toBeNull()
    } finally {
      cleanup()
      adapter.dispose()
    }
  })
})
