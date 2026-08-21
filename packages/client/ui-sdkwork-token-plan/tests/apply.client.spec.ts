import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/RailEntry.tsx', () => ({ TokenPlanRailEntry: 'TokenPlanRailEntry' }))
vi.mock('../src/client/TokenPlanPage.tsx', () => ({ TokenPlanPage: 'TokenPlanPage' }))

import { apply, inject } from '../src/client/index.ts'
import { TokenPlanRailEntry } from '../src/client/RailEntry.tsx'
import { TokenPlanPage } from '../src/client/TokenPlanPage.tsx'

function createContext(session: null | { accessToken?: string }) {
  const registrations: Array<{ name: string; key?: string; component: unknown; inject: () => unknown }> = []
  const locale = { register: vi.fn() }
  const slots = {
    inject: vi.fn((_name: string, register: () => unknown) => { register() }),
    register: vi.fn((options: { name: string; key?: string; inject: () => unknown }, component: unknown) => {
      registrations.push({
        name: options.name,
        ...(options.key === undefined ? {} : { key: options.key }),
        component,
        inject: options.inject,
      })
      return vi.fn()
    }),
  }
  const env = { isConfigured: () => false, apiBaseUrl: () => '', accessToken: () => '', subscribe: () => vi.fn() }
  const iam = {
    controller: {
      getState: () => ({ session }),
      subscribe: () => vi.fn(),
    },
    openSignIn: vi.fn(),
  }
  const theme = {
    getTheme: () => ({ active: { colorScheme: 'light' as const } }),
  }
  const services: Record<string, unknown> = { env, iam, theme }
  return {
    context: {
      effect: (effect: () => unknown) => effect(),
      locale,
      slots,
      get: (key: string) => services[key],
      on: vi.fn(() => vi.fn()),
    } as never,
    registrations,
  }
}

describe('ui-sdkwork-token-plan apply', () => {
  it('declares environment, IAM, and theme so the catalog can follow the host scheme', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'theme'])
    for (const session of [null, { accessToken: 'session-token' }] as const) {
      const { context, registrations } = createContext(session)
      apply(context)
      expect(registrations.some(entry => entry.name === 'mode.rail.entry' && entry.key === 'token-plan' && entry.component === TokenPlanRailEntry)).toBe(true)
      expect(registrations.some(entry => entry.name === 'mode.page' && entry.key === 'token-plan' && entry.component === TokenPlanPage)).toBe(true)
    }
  })

  it('resolves the environment, IAM, and theme when the page slot is rendered', () => {
    const { context, registrations } = createContext(null)
    apply(context)
    const rail = registrations.find(entry => entry.name === 'mode.rail.entry')!
    expect(rail.inject()).toEqual({ mode: 'token-plan' })
    const page = registrations.find(entry => entry.name === 'mode.page')!
    const injected = page.inject() as {
      mode: string
      env: unknown
      iam: unknown
      theme: { getColorScheme: () => string; subscribe: (listener: () => void) => void }
    }
    expect(injected.mode).toBe('token-plan')
    expect(injected.env).toBe((context as never as { get: (key: string) => unknown }).get('env'))
    expect(injected.iam).toBe((context as never as { get: (key: string) => unknown }).get('iam'))
    expect(injected.theme.getColorScheme()).toBe('light')
    const listener = vi.fn()
    injected.theme.subscribe(listener)
    expect((context as never as { on: ReturnType<typeof vi.fn> }).on).toHaveBeenCalledWith('theme/change', listener)
  })
})
