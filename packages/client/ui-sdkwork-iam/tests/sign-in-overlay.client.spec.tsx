// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createSdkworkAuthController, type SdkworkAuthRuntimeConfig } from '@sdkwork/auth-pc-react'
import { SignInOverlay, type SignInOverlayProps } from '../src/client/SignInOverlay.tsx'
import type { IamSignInStep } from '../src/client/iam-ui-store.ts'

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

function overlay({
  open, step = 'entry', configured = true, startApiKey, browserFailed = false, browserHandoff = false,
  runtimeConfig = { leftRailMode: 'highlights-only', loginMethods: ['password'] },
}: {
  open: boolean
  step?: IamSignInStep
  configured?: boolean
  startApiKey?: () => void
  browserFailed?: boolean
  browserHandoff?: boolean
  runtimeConfig?: SdkworkAuthRuntimeConfig
} = { open: true }) {
  const onClose = vi.fn()
  const onStartLogin = vi.fn()
  const onStartInAppLogin = vi.fn()
  const onRetryBrowser = vi.fn()
  const props = {
    controller: controller(),
    onClose,
    onStartLogin,
    onStartInAppLogin,
    onRetryBrowser,
    ...startApiKey === undefined ? {} : { startApiKey },
    locale: 'zh-CN',
    runtimeConfig,
    useStore: vi.fn(<T,>(sel: (s: { modalOpen: boolean; step: IamSignInStep }) => T) => sel({ modalOpen: open, step })),
    useConfigured: vi.fn((sel: (c: boolean) => boolean) => sel(configured)),
    useBrowserFailed: vi.fn((sel: (failed: boolean) => boolean) => sel(browserFailed)),
    useBrowserHandoff: vi.fn((sel: (handoff: boolean) => boolean) => sel(browserHandoff)),
    useTheme: vi.fn((sel: (s: { active: { colorScheme: 'light' | 'dark' } }) => { active: { colorScheme: 'light' | 'dark' } }) =>
      sel({ active: { colorScheme: 'light' } })),
    t: (key: string): string => key,
  }
  render(<SignInOverlay {...props as unknown as SignInOverlayProps} />)
  return { onClose, onStartLogin, onStartInAppLogin, onRetryBrowser }
}

describe('SignInOverlay', () => {
  it('renders nothing while the modal is closed (the overlay layer stays click-through)', () => {
    overlay({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on the product login entry rather than the account method form', () => {
    const startApiKey = vi.fn()
    const { onStartLogin } = overlay({ open: true, startApiKey })
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // The entry is the shared welcome surface: brand, welcome line, and the
    // two choices. The sdkwork method tabs only exist behind Sign in.
    expect(within(dialog).getByRole('button', { name: 'entry.signIn' })).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'entry.addApiKey' })).not.toBeNull()
    expect(screen.queryAllByText('手机验证码')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'entry.signIn' }))
    expect(onStartLogin).toHaveBeenCalledOnce()
    fireEvent.click(within(dialog).getByRole('button', { name: 'entry.addApiKey' }))
    expect(startApiKey).toHaveBeenCalledOnce()
  })

  it('offers the sign-in choice alone when the shell exposes no API-key page', () => {
    overlay({ open: true })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'entry.signIn' })).not.toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'entry.addApiKey' })).toBeNull()
  })

  it('keeps the in-app account form one link away while Sign in hands off to the browser', () => {
    const { onStartLogin, onStartInAppLogin } = overlay({ open: true, browserHandoff: true })
    const dialog = screen.getByRole('dialog')
    // The browser hand-off owns Sign in, so the in-app form keeps the quiet
    // action under the column instead of disappearing from the entry.
    fireEvent.click(within(dialog).getByRole('button', { name: 'entry.inAppLogin' }))
    expect(onStartInAppLogin).toHaveBeenCalledOnce()
    expect(onStartLogin).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'entry.signIn' }))
    expect(onStartLogin).toHaveBeenCalledOnce()
  })

  it('does not repeat the account form when Sign in already raises it', () => {
    overlay({ open: true })
    expect(screen.queryByRole('button', { name: 'entry.inAppLogin' })).toBeNull()
  })

  it('mounts the account method surface on the login step', () => {
    overlay({ open: true, step: 'login' })
    expect(screen.getByRole('dialog', { hidden: true })).not.toBeNull()
  })

  it('holds the browser hand-off with its retry action', () => {
    const { onRetryBrowser } = overlay({ open: true, step: 'browser' })
    const dialog = screen.getByRole('dialog')
    // The hosted login page lives in the system browser; the card states the
    // wait and offers the one way forward.
    expect(within(dialog).getByText('browser.title')).not.toBeNull()
    expect(within(dialog).getByText('browser.detail')).not.toBeNull()
    expect(within(dialog).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'browser.retry' }))
    expect(onRetryBrowser).toHaveBeenCalledOnce()
  })

  it('reports a failed browser hand-off instead of claiming the page opened', () => {
    overlay({ open: true, step: 'browser', browserFailed: true })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('browser.failedTitle')).not.toBeNull()
    expect(within(dialog).getByText('browser.failedDetail')).not.toBeNull()
  })

  it('offers the configured account login methods on the login step', () => {
    overlay({ open: true, step: 'login', runtimeConfig: { leftRailMode: 'highlights-only', loginMethods: ['password', 'phoneCode', 'emailCode'] } })
    expect(screen.getAllByText('手机验证码').length).toBeGreaterThan(0)
    expect(screen.getAllByText('邮箱验证码').length).toBeGreaterThan(0)
  })

  it('does not offer the hosted browser login as a separate entry', () => {
    overlay({ open: true, step: 'login' })
    expect(screen.queryByTestId('sdkwork-desktop-browser-login-entry')).toBeNull()
  })

  it('renders the configuration notice dialog while open and unconfigured', () => {
    overlay({ open: true, configured: false })
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // The notice copy, not the sdkwork auth surface, without a base URL.
    expect(within(dialog).getByText('page.unconfigured.title')).not.toBeNull()
  })

  it('renders nothing while closed even unconfigured', () => {
    overlay({ open: false, configured: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
