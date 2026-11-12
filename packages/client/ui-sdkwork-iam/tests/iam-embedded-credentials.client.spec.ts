// @vitest-environment jsdom
/**
 * Credential sweep spec: the embedded SDKWork packages keep their own plaintext
 * token copies in `localStorage`, and the host IAM sign-out / account switch is
 * the point where they must disappear. The sweep removes exactly those two
 * credential families — never `localStorage.clear()` — and leaves the device
 * preferences that describe the browser rather than an account.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import {
  clearEmbeddedSdkworkCredentials,
  isEmbeddedSdkworkCredentialKey,
  SDKWORK_AGENTS_SESSION_STORAGE_KEY,
  SDKWORK_CORE_CREDENTIAL_STORAGE_PREFIX,
  type IamCredentialStorage,
} from '../src/client/iam-embedded-credentials.ts'
import { IamService } from '../src/client/iam-service.ts'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'

/** Settings scope stand-in carrying the shipped defaults. */
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

/** Environment with no hosted sign-out page and a configured IAM origin. */
function envOf(): EnvService {
  return {
    isConfigured: () => true,
    apiBaseUrl: () => 'https://api.example',
    appId: () => 'sdkwork-birdcoder',
    accessToken: () => '',
    cloudRouterUrl: () => '',
    subscribe: () => () => {},
  } as unknown as EnvService
}

function layoutOf(): ILayout {
  return { toggleSidebar: vi.fn(), setSidebarVisible: vi.fn(), openDetails: vi.fn(), closeDetails: vi.fn(), setMode: vi.fn() }
}

const CORE = SDKWORK_CORE_CREDENTIAL_STORAGE_PREFIX

/** Seed the embedded packages' copies plus unrelated preferences. */
function seedCredentials(): void {
  localStorage.setItem(SDKWORK_AGENTS_SESSION_STORAGE_KEY, '{"accessToken":"a"}')
  localStorage.setItem(`${CORE}auth-token`, 'a')
  localStorage.setItem(`${CORE}refresh-token`, 'r')
  localStorage.setItem(`${CORE}im-session`, 'i')
  localStorage.setItem(`${CORE}preferences`, '{"themeColor":"tech-blue"}')
  localStorage.setItem('dsh.iam.session', '{"accessToken":"host"}')
  localStorage.setItem('dsh.theme', 'dark')
}

const originalOpen = Object.getOwnPropertyDescriptor(globalThis, 'open')

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  if (originalOpen === undefined) {
    Reflect.deleteProperty(globalThis, 'open')
  } else {
    Object.defineProperty(globalThis, 'open', originalOpen)
  }
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('isEmbeddedSdkworkCredentialKey', () => {
  it('classifies the two credential families and spares device preferences', () => {
    expect(isEmbeddedSdkworkCredentialKey(SDKWORK_AGENTS_SESSION_STORAGE_KEY)).toBe(true)
    expect(isEmbeddedSdkworkCredentialKey(`${CORE}auth-token`)).toBe(true)
    expect(isEmbeddedSdkworkCredentialKey(`${CORE}refresh-token`)).toBe(true)
    expect(isEmbeddedSdkworkCredentialKey(`${CORE}im-session`)).toBe(true)
    // The core prefix also carries the shell preferences: device, not account.
    expect(isEmbeddedSdkworkCredentialKey(`${CORE}preferences`)).toBe(false)
    expect(isEmbeddedSdkworkCredentialKey('dsh.iam.session')).toBe(false)
    expect(isEmbeddedSdkworkCredentialKey('sdkwork-agents-pc:theme')).toBe(false)
  })
})

describe('clearEmbeddedSdkworkCredentials', () => {
  it('removes only the embedded credential copies', () => {
    seedCredentials()
    const removed = clearEmbeddedSdkworkCredentials()

    expect(removed).toHaveLength(4)
    expect(removed).toEqual(expect.arrayContaining([
      SDKWORK_AGENTS_SESSION_STORAGE_KEY,
      `${CORE}auth-token`,
      `${CORE}refresh-token`,
      `${CORE}im-session`,
    ]))
    expect(localStorage.getItem(SDKWORK_AGENTS_SESSION_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(`${CORE}auth-token`)).toBeNull()
    // Device preferences and the host's own session are out of scope.
    expect(localStorage.getItem(`${CORE}preferences`)).toBe('{"themeColor":"tech-blue"}')
    expect(localStorage.getItem('dsh.theme')).toBe('dark')
    expect(localStorage.getItem('dsh.iam.session')).not.toBeNull()
  })

  it('tolerates a storage whose enumeration fails', () => {
    const storage: IamCredentialStorage = {
      get length(): number { throw new Error('blocked') },
      key: () => null,
      removeItem: () => {},
    }
    expect(clearEmbeddedSdkworkCredentials(storage)).toEqual([])
  })

  it('does nothing when the page has no accessible localStorage', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get(): never { throw new Error('blocked') },
    })
    try {
      expect(clearEmbeddedSdkworkCredentials()).toEqual([])
    } finally {
      if (descriptor !== undefined) Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('keeps sweeping after one removal is refused', () => {
    const entries = new Map<string, string>([
      [SDKWORK_AGENTS_SESSION_STORAGE_KEY, '{}'],
      [`${CORE}auth-token`, 'a'],
    ])
    const storage: IamCredentialStorage = {
      get length() { return entries.size },
      key: index => [...entries.keys()][index] ?? null,
      removeItem: (key) => {
        if (key === SDKWORK_AGENTS_SESSION_STORAGE_KEY) throw new Error('refused')
        entries.delete(key)
      },
    }
    expect(clearEmbeddedSdkworkCredentials(storage)).toEqual([`${CORE}auth-token`])
    expect(entries.has(SDKWORK_AGENTS_SESSION_STORAGE_KEY)).toBe(true)
  })
})

describe('IamService credential sweep', () => {
  it('removes the embedded copies when the host session ends', async () => {
    const open = vi.fn().mockReturnValue(null)
    Object.defineProperty(globalThis, 'open', { value: open, configurable: true, writable: true })
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    service.controller.applySession({
      accessToken: 'at',
      authToken: 'auth',
      user: { id: 'u1', displayName: 'Bird' },
    })
    const signOut = vi.spyOn(service.controller, 'signOut').mockResolvedValue(undefined)
    seedCredentials()

    service.confirmSignOut()

    await vi.waitFor(() => { expect(localStorage.getItem(SDKWORK_AGENTS_SESSION_STORAGE_KEY)).toBeNull() })
    expect(localStorage.getItem(`${CORE}auth-token`)).toBeNull()
    expect(localStorage.getItem(`${CORE}preferences`)).toBe('{"themeColor":"tech-blue"}')
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('also sweeps when the remote sign-out fails', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    service.controller.applySession({ accessToken: 'at', authToken: 'auth', user: { id: 'u1', displayName: 'Bird' } })
    vi.spyOn(service.controller, 'signOut').mockRejectedValue(new Error('offline'))
    seedCredentials()

    service.confirmSignOut()

    await vi.waitFor(() => { expect(localStorage.getItem(SDKWORK_AGENTS_SESSION_STORAGE_KEY)).toBeNull() })
    expect(localStorage.getItem(`${CORE}refresh-token`)).toBeNull()
  })
})
