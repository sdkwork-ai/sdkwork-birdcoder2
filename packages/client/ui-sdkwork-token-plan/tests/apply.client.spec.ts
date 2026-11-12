import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/RailEntry.tsx', () => ({ TokenPlanRailEntry: 'TokenPlanRailEntry' }))
vi.mock('../src/client/TokenPlanPage.tsx', () => ({ TokenPlanPage: 'TokenPlanPage' }))

import { apply, inject } from '../src/client/index.ts'
import { PointsRechargeDialog } from '../src/client/PointsRechargeDialog.tsx'
import { TokenPlanRailEntry } from '../src/client/RailEntry.tsx'
import { TokenPlanPage } from '../src/client/TokenPlanPage.tsx'

function createContext(session: null | { accessToken?: string }) {
  const registrations: Array<{ name: string; key?: string; id?: string; component: unknown; inject: () => unknown }> = []
  const locale = { register: vi.fn(), bind: () => (key: string) => key }
  const slots = {
    inject: vi.fn((_name: string, register: () => unknown) => { register() }),
    register: vi.fn((options: { name: string; key?: string; id?: string; inject: () => unknown }, component: unknown) => {
      registrations.push({
        name: options.name,
        ...(options.key === undefined ? {} : { key: options.key }),
        ...(options.id === undefined ? {} : { id: options.id }),
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
  const layout = { setMode: vi.fn() }
  const services: Record<string, unknown> = { env, iam, theme, layout }
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
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'theme', 'layout'])
    for (const session of [null, { accessToken: 'session-token' }] as const) {
      const { context, registrations } = createContext(session)
      apply(context)
      expect(registrations.some(entry => entry.name === 'mode.rail.entry' && entry.key === 'token-plan' && entry.component === TokenPlanRailEntry)).toBe(true)
      expect(registrations.some(entry => entry.name === 'mode.page' && entry.key === 'token-plan' && entry.component === TokenPlanPage)).toBe(true)
      expect(registrations.some(entry => entry.name === 'settings.menu.plan')).toBe(true)
      expect(registrations.some(entry => entry.name === 'settings.pointsRecharge' && entry.component === PointsRechargeDialog)).toBe(true)
      expect(registrations.some(entry => entry.name === 'settings.section' && entry.id === 'points')).toBe(true)
    }
  })

  it('defers the purchase-modal commerce port until the modal opens', async () => {
    const { context, registrations } = createContext(null)
    apply(context)
    const seat = registrations.find(entry => entry.name === 'settings.pointsRecharge')!
    const injected = seat.inject() as {
      readService: () => unknown
      readBalance: () => Promise<number | undefined>
    }
    // An unconfigured deployment has no Order client to build: the modal
    // reports the missing environment instead of throwing during render.
    expect(injected.readService()).toBeUndefined()
    // Signed out: the wallet read answers absence without touching commerce.
    await expect(injected.readBalance()).resolves.toBeUndefined()
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
