// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { createSdkworkAuthController } from '@sdkwork/auth-pc-react'
import { SignInOverlay, type SignInOverlayProps } from '../src/client/SignInOverlay.tsx'

afterEach(cleanup)

/** A real controller whose network-backed methods stay inert for jsdom. */
function controller(): ReturnType<typeof createSdkworkAuthController> {
  return createSdkworkAuthController({
    initialState: {
      isAuthenticated: false,
      isBootstrapped: true,
      isBusy: false,
      session: null,
      status: 'anonymous',
      user: null,
    },
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

function overlay(open: boolean, configured = true) {
  const onClose = vi.fn()
  const props = {
    controller: controller(),
    onClose,
    locale: 'zh-CN',
    useStore: vi.fn((sel: (s: { modalOpen: boolean }) => boolean) => sel({ modalOpen: open })),
    useConfigured: vi.fn((sel: (c: boolean) => boolean) => sel(configured)),
    useTheme: vi.fn((sel: (s: { active: { colorScheme: 'light' | 'dark' } }) => { active: { colorScheme: 'light' | 'dark' } }) =>
      sel({ active: { colorScheme: 'light' } })),
    t: (key: string): string => key,
  }
  render(<SignInOverlay {...props as unknown as SignInOverlayProps} />)
  return { onClose }
}

describe('SignInOverlay', () => {
  it('renders nothing while the modal is closed (the overlay layer stays click-through)', () => {
    overlay(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mounts the modal login surface while open and configured', () => {
    overlay(true)
    expect(screen.getByRole('dialog', { hidden: true })).not.toBeNull()
  })

  it('renders the configuration notice dialog while open and unconfigured', () => {
    overlay(true, false)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // The notice copy, not the sdkwork auth surface, without a base URL.
    expect(within(dialog).getByText('page.unconfigured.title')).not.toBeNull()
  })

  it('renders nothing while closed even unconfigured', () => {
    overlay(false, false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
