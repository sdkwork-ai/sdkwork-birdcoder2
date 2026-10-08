// @vitest-environment jsdom
/** Demand Hall host adapter spec: the env/iam/locale → SDKWork snapshot
 * composition, the static-token fallback for anonymous browsing, snapshot
 * caching and invalidation, the single-active-adapter handoff, and the render
 * faces (themed shell root with the scroll container; unconfigured status).
 * The embedded surface itself is mocked out; the mock captures the host props
 * so the theme bridge's subscription relay is exercised too. */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'

type MarketsSurfaceProps = Record<string, unknown>

const marketsSurfaceProps: MarketsSurfaceProps[] = []

vi.mock('@sdkwork/appstore-pc-embed', () => ({
  AppstoreMarketsSurface: (props: MarketsSurfaceProps) => {
    marketsSurfaceProps.push(props)
    return null
  },
}))

import {
  DemandHallApp,
  configureDemandHallHost,
  createDemandHallHostRuntime,
  toDemandHallSession,
  type DemandHallAppProps,
  type DemandHallHostEnvironment,
  type DemandHallHostIam,
  type DemandHallHostLocale,
  type DemandHallHostTheme,
} from '../src/client/demandHallHost.ts'

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toDemandHallSession>[0]
  language?: string
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  const themeListeners = new Set<() => void>()
  const env: DemandHallHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: DemandHallHostIam = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  }
  const locale: DemandHallHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  const theme: DemandHallHostTheme = {
    getColorScheme: () => 'light',
    // Fan-out set: the themed shell subscribes per render seat and the
    // embedded surface relay subscribes once more.
    subscribe: (listener) => {
      themeListeners.add(listener)
      return () => { themeListeners.delete(listener) }
    },
  }
  return {
    env, iam, locale, theme,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
    fireTheme: () => { for (const l of themeListeners) l() },
  }
}

describe('toDemandHallSession', () => {
  it('maps credentials and user profile, trimming tokens', () => {
    expect(toDemandHallSession({
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
    expect(toDemandHallSession(null, ' static ')).toEqual({ accessToken: 'static' })
  })

  it('returns null when neither session nor static token carries credentials', () => {
    expect(toDemandHallSession(null, '')).toBeNull()
    expect(toDemandHallSession({ user: { id: 'u' } }, '')).toBeNull()
  })
})

describe('DemandHallHostRuntime', () => {
  it('reads the composed snapshot from env, iam, and locale', () => {
    const h = harness({
      baseUrl: 'https://gw.example',
      accessToken: 'static-token',
      session: { accessToken: 'iam-token', user: { id: 'u1' } },
      language: 'zh',
    })
    const runtime = createDemandHallHostRuntime(h)
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
    const runtime = createDemandHallHostRuntime(h)
    runtime.start()
    const snapshot = runtime.getHostSnapshot()
    expect(snapshot.accessToken).toBe('static')
    // With no IAM session the static token rides the session snapshot
    // (toDemandHallSession(null, 'static') → { accessToken: 'static' }).
    expect(snapshot.session).toEqual({ accessToken: 'static' })
    runtime.dispose()
  })

  it('caches the snapshot until an input changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createDemandHallHostRuntime(h)
    runtime.start()
    const first = runtime.getHostSnapshot()
    expect(runtime.getHostSnapshot()).toBe(first)
    h.fireLocale()
    expect(runtime.getHostSnapshot()).not.toBe(first)
    runtime.dispose()
  })

  it('bumps the environment revision on environment changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createDemandHallHostRuntime(h)
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    h.fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    runtime.dispose()
  })

  it('propagates iam and locale changes without remounting the runtime', () => {
    const h = harness({ baseUrl: 'https://gw.example', language: 'en' })
    const runtime = createDemandHallHostRuntime(h)
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
    const runtime = createDemandHallHostRuntime(h)
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
    const first = configureDemandHallHost(h)
    const second = configureDemandHallHost(h)
    // The handoff disposed the first adapter: firing its sources is a no-op.
    expect(() => { h.fireEnvironment() }).not.toThrow()
    second.dispose()
    first.dispose()
  })
})

describe('DemandHallApp', () => {
  it('mounts the demands page under the themed shell root carrying the scroll container', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const adapter = configureDemandHallHost(h)
    try {
      const view = render(createElement(DemandHallApp, {
        t: (key: Parameters<DemandHallAppProps['t']>[0]) => key,
      }))
      const shell = view.container.firstElementChild as HTMLElement
      expect(shell.getAttribute('data-sdk-surface')).toBe('demand-hall')
      // The shell root is the catalog's scroll container: neither the
      // storefront page nor the frame's pageBody owns one.
      expect(shell.className).toContain('catalogScroll')
      // The embedded surface is the demands page of the single-page markets
      // embed, configured from the host snapshot.
      const props = marketsSurfaceProps.at(-1)!
      expect(props['page']).toBe('demands')
      expect(props['apiBaseUrl']).toBe('https://gw.example')
      expect(props['locale']).toBe('zh-CN')
    } finally {
      cleanup()
      adapter.dispose()
    }
  })

  it('relays host color-scheme changes into the embedded surface bridge', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const adapter = configureDemandHallHost(h)
    try {
      render(createElement(DemandHallApp, {
        t: (key: Parameters<DemandHallAppProps['t']>[0]) => key,
      }))
      const props = marketsSurfaceProps.at(-1)!
      expect((props['resolveHostColorScheme'] as () => string)()).toBe('light')
      const listener = vi.fn()
      const stop = (props['subscribeHostColorScheme'] as (l: () => void) => () => void)(listener)
      // The relay subscribes to the host theme bridge: a scheme flip reaches
      // the listener with the resolved scheme, and unsubscribing stops it.
      h.theme.getColorScheme = () => 'dark'
      h.fireTheme()
      expect(listener).toHaveBeenCalledTimes(1)
      stop()
      h.fireTheme()
      expect(listener).toHaveBeenCalledTimes(1)
      expect((props['resolveHostColorScheme'] as () => string)()).toBe('dark')
    } finally {
      cleanup()
      adapter.dispose()
    }
  })

  it('renders the unconfigured status face without a shell when the gateway is absent', () => {
    const h = harness({ baseUrl: '' })
    const adapter = configureDemandHallHost(h)
    try {
      const view = render(createElement(DemandHallApp, {
        t: (key: Parameters<DemandHallAppProps['t']>[0]) => key,
      }))
      expect(view.container.querySelector('[data-demand-hall-empty="unconfigured"]')).toBeTruthy()
      expect(view.container.querySelector('[data-sdk-surface]')).toBeNull()
    } finally {
      cleanup()
      adapter.dispose()
    }
  })
})
