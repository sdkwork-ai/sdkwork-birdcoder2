/**
 * The redeem leg against the real generated transport.
 *
 * `oauth.desktopSessions.create` retries every request four times; an
 * authorization code is single-use, so a retried redeem can only report a
 * failure after the first attempt consumed the code. These cases drive the real
 * SDK client and assert the redeem is sent once and surfaced as one failure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'

import { createIamDesktopLogin } from '../src/client/iam-desktop.ts'

const REDIRECT = 'birdcoder://auth/callback'

let handlers: Array<(url: string) => void> = []
const opened: string[] = []

function installBridge(): SdkworkDesktopBridgeShape {
  handlers = []
  const bridge: SdkworkDesktopBridgeShape = {
    deepLinks: {
      getInitialUrl: async () => null,
      onOpenUrl: (handler) => {
        handlers.push(handler)
        return () => { handlers = handlers.filter(candidate => candidate !== handler) }
      },
    },
    shellOpen: { open: async (url) => { opened.push(url) } },
  }
  return bridge
}

function emitDeepLink(url: string): void {
  for (const handler of [...handlers]) handler(url)
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 5) })
}

function sessionBody(): string {
  return JSON.stringify({
    code: 0,
    traceId: 'trace',
    data: {
      accessToken: 'access',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user-1' },
    },
  })
}

beforeEach(() => {
  opened.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('desktop redeem transport', () => {
  it('sends a gateway failure once instead of retrying the single-use code', async () => {
    const onError = vi.fn()
    const onSession = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: REDIRECT,
      authorizeBaseUrl: 'https://platform.example.test',
      baseUrl: 'https://api.example.test',
      tokenManager: {} as never,
      bridge: installBridge(),
      onSession,
      onError,
    })

    const fetchStub = vi.fn(async () => new Response(JSON.stringify({
      type: 'https://docs.example/problems/50200',
      title: 'Bad gateway',
      status: 502,
      code: 50200,
      traceId: 'trace-502',
    }), { status: 502, headers: { 'content-type': 'application/problem+json' } }))
    vi.stubGlobal('fetch', fetchStub)

    await login.begin()
    const state = new URL(opened[0]!).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?code=sdkwork-oauth_code-once&state=${state}`)
    await settle()

    // One POST: a retry would present a code the server may already have
    // consumed, turning a completed login into a reported failure.
    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(onSession).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'exchange-failed' })
    login.dispose()
  })

  it('redeems a delivered code once and hands the session to the commit', async () => {
    const onSession = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: REDIRECT,
      authorizeBaseUrl: 'https://platform.example.test',
      baseUrl: 'https://api.example.test',
      tokenManager: {} as never,
      bridge: installBridge(),
      onSession,
    })

    const fetchStub = vi.fn(async () => new Response(sessionBody(), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchStub)

    await login.begin()
    const state = new URL(opened[0]!).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?code=sdkwork-oauth_code-ok&state=${state}`)
    await settle()

    expect(fetchStub).toHaveBeenCalledTimes(1)
    expect(onSession).toHaveBeenCalledTimes(1)
    expect(onSession.mock.calls[0][0]).toMatchObject({ accessToken: 'access', authToken: 'auth' })
    login.dispose()
  })
})
