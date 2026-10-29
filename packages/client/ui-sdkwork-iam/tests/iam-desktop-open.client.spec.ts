// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sdkwork/iam-app-sdk', () => ({
  createClient: vi.fn(() => ({
    oauth: { desktopSessions: { create: vi.fn(async () => ({})) } },
  })),
}))

import { createIamDesktopLogin } from '../src/client/iam-desktop.ts'
import type { SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'

function bridge(): { shape: SdkworkDesktopBridgeShape; opened: string[] } {
  const opened: string[] = []
  return {
    opened,
    shape: {
      deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => () => {} },
      shellOpen: {
        open: async (url) => { opened.push(url) },
      },
    },
  }
}

describe('createIamDesktopLogin browser open', () => {
  it('opens the hosted authorize URL with the upstream path and PKCE parameters', async () => {
    const { shape, opened } = bridge()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager: {} as never,
      bridge: shape,
      onSession: vi.fn(),
    })

    await login.begin()

    expect(opened).toHaveLength(1)
    const url = new URL(opened[0])
    expect(url.origin).toBe('https://platform.birdcoder.com')
    expect(url.pathname).toBe('/iam/v3/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('birdcoder')
    expect(url.searchParams.get('redirect_uri')).toBe('birdcoder://auth/callback')
    expect(url.searchParams.get('scope')).toBe('openid profile offline_access')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).not.toBeNull()
    expect(url.searchParams.get('state')).not.toBeNull()

    await login.cancel()
    login.dispose()
  })

  it('opens the development authorize origin when the launch resolved that tier', async () => {
    const { shape, opened } = bridge()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'http://platform-dev.birdcoder.com',
      baseUrl: 'http://api-dev.birdcoder.com',
      tokenManager: {} as never,
      bridge: shape,
      onSession: vi.fn(),
    })

    await login.begin()

    expect(opened).toHaveLength(1)
    const url = new URL(opened[0])
    expect(url.protocol).toBe('http:')
    expect(url.host).toBe('platform-dev.birdcoder.com')
    expect(url.pathname).toBe('/iam/v3/oauth/authorize')

    await login.cancel()
    login.dispose()
  })
})
