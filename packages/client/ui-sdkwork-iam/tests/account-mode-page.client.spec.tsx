// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createSdkworkAuthController } from '@sdkwork/auth-pc-react'
import { AccountModePage, type AccountModePageProps } from '../src/client/AccountModePage.tsx'
import { zh } from '../src/client/locales.ts'
import type { SdkworkAuthControllerState, SdkworkAuthRuntimeConfig } from '@sdkwork/auth-pc-react'

afterEach(cleanup)

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

const ANONYMOUS: SdkworkAuthControllerState = {
  isAuthenticated: false,
  isBootstrapped: true,
  isBusy: false,
  session: null,
  status: 'anonymous',
  user: null,
}

const AUTHENTICATED: SdkworkAuthControllerState = {
  isAuthenticated: true,
  isBootstrapped: true,
  isBusy: false,
  session: null,
  status: 'authenticated',
  user: { id: 'u1', username: 'bird', displayName: 'Bird Coder', email: 'bird@example.com' },
}

/** A real controller whose network-backed methods stay inert for jsdom. */
function controller(): ReturnType<typeof createSdkworkAuthController> {
  return createSdkworkAuthController({
    initialState: { ...ANONYMOUS, isBootstrapped: true },
    service: {
      getCurrentSession: async () => null,
      getCurrentUser: async () => null,
      listScanLoginModes: async () => [],
      listOAuthProviders: async () => [],
      getVerificationPolicy: async () => ({
        emailCodeLoginEnabled: false,
        emailRegistrationVerificationRequired: false,
        phoneCodeLoginEnabled: false,
        phoneRegistrationVerificationRequired: false,
      }),
    },
  })
}

const RUNTIME_CONFIG: SdkworkAuthRuntimeConfig = {
  leftRailMode: 'highlights-only',
  loginMethods: ['password'],
}

function page(over: {
  available?: boolean
  state?: SdkworkAuthControllerState
  onSignOut?: () => void
} = {}) {
  const onSignOut = over.onSignOut ?? vi.fn()
  const props = {
    mode: 'account' as const,
    controller: controller(),
    runtimeConfig: RUNTIME_CONFIG,
    onSignOut,
    locale: 'zh-CN',
    useAvailable: vi.fn((sel: (v: boolean) => boolean) => sel(over.available ?? true)),
    useAuthState: vi.fn((sel: (s: SdkworkAuthControllerState) => SdkworkAuthControllerState) => sel(over.state ?? ANONYMOUS)),
    useTheme: vi.fn((sel: (s: { active: { colorScheme: 'light' | 'dark' } }) => { active: { colorScheme: 'light' | 'dark' } }) =>
      sel({ active: { colorScheme: 'light' } })),
    t,
  }
  render(<AccountModePage {...props as unknown as AccountModePageProps} />)
  return { onSignOut }
}

describe('AccountModePage', () => {
  it('fails loud with the configuration notice while the base URL is unconfigured', () => {
    page({ available: false })
    expect(screen.getByText('未配置 IAM 服务')).not.toBeNull()
  })

  it('mounts the full-page auth surface while signed out', () => {
    page()
    // The sdkwork auth page renders the password login form in the column.
    expect(screen.getByRole('button', { name: /登录/i })).not.toBeNull()
  })

  it('shows the account summary and signs out while authenticated', () => {
    const { onSignOut } = page({ state: AUTHENTICATED })
    expect(screen.getByText('Bird Coder')).not.toBeNull()
    expect(screen.getByText('bird')).not.toBeNull()
    expect(screen.getByText('bird@example.com')).not.toBeNull()
    act(() => { screen.getByRole('button', { name: '退出登录' }).click() })
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
