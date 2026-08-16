import { describe, expect, it, vi } from 'vitest'
import { createIamAccountSource, toAccountProfile } from '../src/client/account-source.ts'
import { IamService } from '../src/client/iam-service.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { SdkworkAuthControllerState } from '@sdkwork/auth-pc-react'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'

function scopeWith(baseUrl: string): SettingsScope<UiIamSettings> {
  return {
    getSnapshot: () => ({
      status: 'ready' as const,
      value: { ...DEFAULT_UI_IAM_SETTINGS, baseUrl },
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: () => () => {},
    set: async () => {},
    unset: async () => {},
  }
}

function layout() {
  return {
    toggleSidebar: vi.fn(),
    setSidebarVisible: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setMode: vi.fn(),
  } as never
}

const ANONYMOUS: SdkworkAuthControllerState = {
  isAuthenticated: false,
  isBootstrapped: false,
  isBusy: false,
  session: null,
  status: 'anonymous',
  user: null,
}

describe('toAccountProfile', () => {
  it('advertises the sign-in gesture while signed out even without a configured base URL', () => {
    expect(toAccountProfile(ANONYMOUS)).toEqual({ signedIn: false, signInAvailable: true })
  })

  it('publishes the display identity once signed in', () => {
    const profile = toAccountProfile({
      ...ANONYMOUS,
      isAuthenticated: true,
      status: 'authenticated',
      user: { id: 'u1', username: 'bird', displayName: 'Bird Coder', email: 'bird@example.com' },
    })
    expect(profile).toEqual({ signedIn: true, username: 'Bird Coder' })
  })

  it('falls back through username, email, then id', () => {
    expect(toAccountProfile({
      ...ANONYMOUS,
      isAuthenticated: true,
      status: 'authenticated',
      user: { id: 'u1', username: 'bird' },
    }).username).toBe('bird')
    expect(toAccountProfile({
      ...ANONYMOUS,
      isAuthenticated: true,
      status: 'authenticated',
      user: { id: 'u1', email: 'bird@example.com' },
    }).username).toBe('bird@example.com')
    expect(toAccountProfile({
      ...ANONYMOUS,
      isAuthenticated: true,
      status: 'authenticated',
      user: { id: 'u1' },
    }).username).toBe('u1')
  })
})

describe('createIamAccountSource', () => {
  it('advertises the sign-in gesture while the base URL is unconfigured', () => {
    const service = new IamService(scopeWith(''), layout())
    const source = createIamAccountSource(service)
    expect(source.getSnapshot()).toEqual({ signedIn: false, signInAvailable: true })
  })

  it('keeps a stable snapshot until the controller state moves', () => {
    const service = new IamService(scopeWith('https://iam.example'), layout())
    const source = createIamAccountSource(service)
    const first = source.getSnapshot()
    expect(source.getSnapshot()).toBe(first)
    service.controller.applySession({
      accessToken: 'at',
      authToken: 'auth',
      user: { id: 'u1', displayName: 'Bird' },
    })
    const second = source.getSnapshot()
    expect(second).toEqual({ signedIn: true, username: 'Bird' })
    expect(second).not.toBe(first)
  })

  it('routes logout and signIn through the service', async () => {
    const service = new IamService(scopeWith('https://iam.example'), layout())
    const source = createIamAccountSource(service)
    const signOut = vi.spyOn(service.controller, 'signOut').mockResolvedValue(undefined)
    const openSignIn = vi.spyOn(service, 'openSignIn').mockResolvedValue(undefined)
    await source.logout()
    expect(signOut).toHaveBeenCalledTimes(1)
    await source.signIn()
    expect(openSignIn).toHaveBeenCalledTimes(1)
  })
})
