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
  return {
    context: { effect: (effect: () => unknown) => effect(), locale, slots, get: (key: string) => key === 'env' ? env : iam } as never,
    registrations,
  }
}

describe('ui-token-plan apply', () => {
  it('declares only the navigation dependencies so the rail is available before commerce services', () => {
    expect(inject).toEqual(['slots', 'locale'])
    for (const session of [null, { accessToken: 'session-token' }] as const) {
      const { context, registrations } = createContext(session)
      apply(context)
      expect(registrations.some(entry => entry.name === 'mode.rail.entry' && entry.key === 'token-plan' && entry.component === TokenPlanRailEntry)).toBe(true)
      expect(registrations.some(entry => entry.name === 'mode.page' && entry.key === 'token-plan' && entry.component === TokenPlanPage)).toBe(true)
    }
  })

  it('resolves the environment and IAM services when the page slot is rendered', () => {
    const { context, registrations } = createContext(null)
    apply(context)
    const page = registrations.find(entry => entry.name === 'mode.page')!
    const injected = page.inject() as { mode: string; env: unknown; iam: unknown }
    expect(injected.mode).toBe('token-plan')
    expect(injected.env).toBe((context as never as { get: (key: string) => unknown }).get('env'))
    expect(injected.iam).toBe((context as never as { get: (key: string) => unknown }).get('iam'))
  })
})
