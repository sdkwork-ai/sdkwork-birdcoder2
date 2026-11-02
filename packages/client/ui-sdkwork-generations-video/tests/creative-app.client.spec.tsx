// @vitest-environment jsdom
/**
 * The embedded creative surface remounts when the signed-in account changes.
 *
 * Its session list is account-scoped server state loaded once on mount, so
 * keeping the same key across a sign-out/sign-in would leave the previous
 * account's sessions on screen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/** Mount log of the mocked embedded surface (hoisted for the mock factory). */
const { mockMounts } = vi.hoisted(() => ({ mockMounts: [] as string[] }))

vi.mock('@sdkwork/agents-pc-creative', () => ({
  CreativeView: ({ defaultCreationMode }: { defaultCreationMode: string }) => {
    mockMounts.push(defaultCreationMode)
    return <div data-testid="creative-view" />
  },
}))

vi.mock('@sdkwork/i18n-pc-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sdkwork/i18n-pc-react')>()
  return {
    ...actual,
    defineSdkworkI18nRuntimeConfig: (config: unknown) => config,
    SdkworkI18nProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

vi.mock('../src/client/sdkworkHostThemeSurface.tsx', () => ({
  SdkworkHostThemeSurface: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import {
  configureCreativeHost,
  CreativeApp,
  type CreativeHostAdapter,
  type CreativeHostSession,
  type ConfigureCreativeHostOptions,
} from '../src/client/creativeHost.ts'

const accountA: CreativeHostSession = { accessToken: 'a-1', authToken: 'b-1', user: { id: 'user-a' } }
const accountB: CreativeHostSession = { accessToken: 'a-2', authToken: 'b-2', user: { id: 'user-b' } }

/** Host fixture: mutable IAM session plus the options the adapter consumes. */
function harness(session: CreativeHostSession | null) {
  let current = session
  let iamListener: (() => void) | undefined
  const options: ConfigureCreativeHostOptions = {
    env: {
      apiBaseUrl: () => 'https://fixture.example',
      accessToken: () => '',
      appId: () => 'birdcoder-app',
      subscribe: () => () => {},
    },
    iam: {
      isSignedIn: () => current !== null,
      requestSignIn: async () => true,
      requireSignedIn: async () => {},
      controller: {
        getState: () => ({ session: current }),
        subscribe: (listener: () => void) => {
          iamListener = listener
          return () => { iamListener = undefined }
        },
      },
    },
    locale: { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} },
    theme: { getColorScheme: () => 'light', subscribe: () => () => {} },
  }
  return {
    options,
    setSession: (next: CreativeHostSession | null) => { current = next },
    fireIam: () => { iamListener?.() },
  }
}

let adapter: CreativeHostAdapter | undefined

afterEach(() => {
  cleanup()
  adapter?.dispose()
  adapter = undefined
  mockMounts.length = 0
})

describe('CreativeApp account lifecycle', () => {
  it('keeps the surface mounted across a token refresh of one account', async () => {
    const h = harness(accountA)
    adapter = configureCreativeHost(h.options)
    render(<CreativeApp />)
    await screen.findByTestId('creative-view')
    expect(mockMounts).toEqual(['video'])

    act(() => {
      h.setSession({ ...accountA, accessToken: 'a-refreshed', authToken: 'b-refreshed' })
      h.fireIam()
    })

    expect(mockMounts).toEqual(['video'])
  })

  it('remounts the surface when the signed-in account changes', async () => {
    const h = harness(accountA)
    adapter = configureCreativeHost(h.options)
    render(<CreativeApp />)
    await screen.findByTestId('creative-view')

    act(() => {
      h.setSession(accountB)
      h.fireIam()
    })

    await screen.findByTestId('creative-view')
    expect(mockMounts).toEqual(['video', 'video'])
  })

  it('remounts the surface when the session ends', async () => {
    const h = harness(accountA)
    adapter = configureCreativeHost(h.options)
    render(<CreativeApp />)
    await screen.findByTestId('creative-view')

    act(() => {
      h.setSession(null)
      h.fireIam()
    })

    await screen.findByTestId('creative-view')
    expect(mockMounts).toEqual(['video', 'video'])
  })
})
