// @vitest-environment jsdom
/**
 * End-to-end regression for the deeplink login: the real desktop bridge, the
 * real `@sdkwork/iam-desktop-auth` controller, the real token store, and the
 * real generated-header builder. Only the generated IAM app client is replaced
 * (the backend contract itself is covered by the IAM Rust integration test),
 * so this spec proves the app-side chain: deep link → PKCE-bound exchange →
 * complete session in `<DSH_HOME>` and `localStorage` → controller session →
 * shared token manager → the dual-token headers every SDK client sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAuthHeaders } from '@sdkwork/sdk-common'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '../src/sdkwork-global-token-manager.ts'

const REDIRECT = 'birdcoder://auth/callback'
const SESSION = {
  authToken: 'auth.jwt.token',
  accessToken: 'access.jwt.token',
  refreshToken: 'refresh.jwt.token',
  sessionId: 'session-1',
  context: { tenantId: '100001', organizationId: '0', loginScope: 'TENANT', appId: 'birdcoder' },
  user: {
    id: 'user-1',
    email: 'bird@example.test',
    displayName: 'Bird User',
    firstName: 'Bird',
    lastName: 'User',
    initials: 'BU',
  },
}

const exchangeCalls: unknown[] = []
const client = {
  auth: {
    sessions: {
      create: vi.fn(async () => SESSION),
      refresh: vi.fn(async () => SESSION),
      current: {
        delete: vi.fn(async () => undefined),
        retrieve: vi.fn(async () => SESSION),
        update: vi.fn(async () => SESSION),
      },
    },
  },
  oauth: {
    desktopSessions: {
      create: vi.fn(async (body: unknown) => {
        exchangeCalls.push(body)
        return SESSION
      }),
    },
  },
  setTokenManager: vi.fn(() => client),
}

vi.mock('@sdkwork/iam-app-sdk', () => ({
  createClient: vi.fn(() => client),
}))

import { IamService } from '../src/client/iam-service.ts'

let openHandlers: Array<(url: string) => void> = []
const openedUrls: string[] = []
let durableRecord: unknown = null

function installDesktopBridge(): void {
  ;(globalThis as Record<string, unknown>).sdkworkDesktop = {
    deepLinks: {
      getInitialUrl: async () => null,
      onOpenUrl: (handler: (url: string) => void) => {
        openHandlers.push(handler)
        return () => {
          openHandlers = openHandlers.filter(candidate => candidate !== handler)
        }
      },
    },
    shellOpen: {
      open: async (url: string) => { openedUrls.push(url) },
    },
    iamSession: {
      read: async () => durableRecord,
      save: async (session: unknown) => { durableRecord = session },
      clear: async () => { durableRecord = null },
    },
  }
}

/** Deliver one OS deep link to every registered listener, as Electron does. */
function emitDeepLink(url: string): void {
  for (const handler of [...openHandlers]) handler(url)
}

function scopeOf(): SettingsScope<UiIamSettings> {
  return {
    getSnapshot: () => ({
      status: 'ready' as const,
      value: DEFAULT_UI_IAM_SETTINGS,
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
}

function envOf(): EnvService {
  return {
    isConfigured: () => true,
    apiBaseUrl: () => 'https://api.example.test',
    appId: () => 'birdcoder',
    appKey: () => 'birdcoder',
    accessToken: () => '',
    subscribe: () => () => {},
  } as unknown as EnvService
}

function layoutOf(): ILayout {
  return {
    toggleSidebar: vi.fn(),
    setSidebarVisible: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setMode: vi.fn(),
  }
}

describe('deeplink login end to end', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    resetSdkworkGlobalTokenManager()
    storage.clear()
    exchangeCalls.length = 0
    openedUrls.length = 0
    openHandlers = []
    durableRecord = null
    client.oauth.desktopSessions.create.mockClear()
    globalThis.localStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value) },
      removeItem: (key) => { storage.delete(key) },
      clear: () => { storage.clear() },
      key: () => null,
      length: 0,
    } as Storage
    installDesktopBridge()
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis as Record<string, unknown>, 'sdkworkDesktop')
    vi.clearAllMocks()
  })

  it('redeems the deep link, persists the complete session, and seeds every SDK', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    expect(service.browserSignInAvailable()).toBe(true)

    // A backend call waiting at the sign-in door is released by the deeplink
    // login, not only by the in-page form.
    const heldCall = service.requestSignIn()

    // 1. The app starts the browser login: PKCE S256 + state + registered
    //    callback reach the hosted platform page.
    await service.beginBrowserSignIn()
    expect(openedUrls).toHaveLength(1)
    const authorizeUrl = new URL(openedUrls[0]!)
    expect(authorizeUrl.origin).toBe('https://platform.birdcoder.com')
    expect(authorizeUrl.pathname).toBe('/iam/v3/oauth/authorize')
    expect(authorizeUrl.searchParams.get('client_id')).toBe('birdcoder')
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizeUrl.searchParams.get('scope')).toContain('openid')
    const state = authorizeUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    // 2. The hosted login completes and the OS delivers the callback to every
    //    registered listener.
    expect(openHandlers).toHaveLength(1)
    emitDeepLink(`${REDIRECT}?code=code-1&state=${state}`)

    // 3. The app redeems the code through the generated IAM app client.
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    await expect(heldCall).resolves.toBe(true)
    expect(exchangeCalls).toHaveLength(1)
    expect(service.browserSignInFailed()).toBe(false)
    expect(exchangeCalls[0]).toMatchObject({
      clientId: 'birdcoder',
      authorizationCode: 'code-1',
      redirectUri: REDIRECT,
    })
    expect(typeof (exchangeCalls[0] as { codeVerifier?: unknown }).codeVerifier).toBe('string')

    // 4. The complete session is durable (`<DSH_HOME>/iam/session.json` shape)
    //    and browser-local, in both stores.
    expect(durableRecord).toMatchObject({
      authToken: SESSION.authToken,
      accessToken: SESSION.accessToken,
      refreshToken: SESSION.refreshToken,
      sessionId: SESSION.sessionId,
    })
    expect((durableRecord as { user?: unknown }).user).toMatchObject({ id: 'user-1', email: 'bird@example.test' })
    expect((durableRecord as { context?: unknown }).context).toMatchObject({ tenantId: '100001', organizationId: '0' })
    expect(JSON.parse(storage.get('dsh.iam.session') ?? '{}')).toMatchObject({
      authToken: SESSION.authToken,
      accessToken: SESSION.accessToken,
    })

    // 5. The controller and the shared token manager carry the same session.
    expect(service.controller.getState().session?.accessToken).toBe(SESSION.accessToken)
    expect(getSdkworkGlobalTokenManager().getTokens()).toMatchObject({
      authToken: SESSION.authToken,
      accessToken: SESSION.accessToken,
      refreshToken: SESSION.refreshToken,
    })

    // 6. Every SDK client built on that manager sends the same dual-token pair
    //    (`buildAuthHeaders` is the generated clients' own header builder).
    const headers = buildAuthHeaders('dual-token', undefined, getSdkworkGlobalTokenManager())
    expect(headers).toMatchObject({
      Authorization: `Bearer ${SESSION.authToken}`,
      'Access-Token': SESSION.accessToken,
    })
  })

  it('signs out of both stores and releases the shared credentials', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]!).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?code=code-2&state=${state}`)
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    expect(durableRecord).not.toBeNull()

    await service.controller.signOut()
    expect(durableRecord).toBeNull()
    expect(storage.has('dsh.iam.session')).toBe(false)
    expect(getSdkworkGlobalTokenManager().getTokens().authToken).toBeUndefined()
    expect(service.isSignedIn()).toBe(false)
  })
})
