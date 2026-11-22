// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createSdkworkAuthController, type SdkworkAuthRuntimeConfig } from '@sdkwork/auth-pc-react'
import { SignInOverlay, type SignInOverlayProps } from '../src/client/SignInOverlay.tsx'
import type { IamBrowserLoginFailure, IamSignInNotice } from '../src/client/iam-service.ts'
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
  browserFailure, browserLink = '', notice, runtimeConfig = { leftRailMode: 'highlights-only', loginMethods: ['password'] },
}: {
  open: boolean
  step?: IamSignInStep
  configured?: boolean
  startApiKey?: () => void
  browserFailed?: boolean
  browserFailure?: IamBrowserLoginFailure
  browserHandoff?: boolean
  browserLink?: string
  notice?: IamSignInNotice
  runtimeConfig?: SdkworkAuthRuntimeConfig
} = { open: true }) {
  const onClose = vi.fn()
  const onStartLogin = vi.fn()
  const onStartInAppLogin = vi.fn()
  const onRetryBrowser = vi.fn()
  const onDismissNotice = vi.fn()
  const props = {
    controller: controller(),
    onClose,
    onStartLogin,
    onStartInAppLogin,
    onRetryBrowser,
    ...startApiKey === undefined ? {} : { startApiKey },
    locale: 'zh-CN',
    runtimeConfig,
    dismissSignInNotice: onDismissNotice,
    useStore: vi.fn(<T,>(sel: (s: { modalOpen: boolean; step: IamSignInStep }) => T) => sel({ modalOpen: open, step })),
    useConfigured: vi.fn((sel: (c: boolean) => boolean) => sel(configured)),
    useBrowserFailed: vi.fn((sel: (failed: boolean) => boolean) => sel(browserFailed)),
    useBrowserFailure: vi.fn(
      (sel: (failure: IamBrowserLoginFailure | undefined) => unknown) => sel(browserFailure)),
    useBrowserHandoff: vi.fn((sel: (handoff: boolean) => boolean) => sel(browserHandoff)),
    useBrowserLink: vi.fn((sel: (link: string) => string) => sel(browserLink)),
    useSignInNotice: vi.fn((sel: (value: IamSignInNotice | undefined) => unknown) => sel(notice)),
    useTheme: vi.fn((sel: (s: { active: { colorScheme: 'light' | 'dark' } }) => { active: { colorScheme: 'light' | 'dark' } }) =>
      sel({ active: { colorScheme: 'light' } })),
    t: (key: string): string => key,
  }
  render(<SignInOverlay {...props as unknown as SignInOverlayProps} />)
  return { onClose, onStartLogin, onStartInAppLogin, onRetryBrowser, onDismissNotice }
}

describe('SignInOverlay', () => {
  it('renders nothing while the modal is closed (the overlay layer stays click-through)', () => {
    overlay({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('announces a browser login that finished while the dialog was closed', () => {
    vi.useFakeTimers()
    try {
      const { onDismissNotice } = overlay({
        open: false,
        notice: { id: 7, kind: 'signed-in', accountName: 'A User' },
      })
      // The card the user closed stays closed; the outcome arrives as a toast.
      expect(screen.queryByRole('dialog')).toBeNull()
      const toast = screen.getByRole('alert')
      expect(toast.textContent).toContain('browser.signedInAs')
      act(() => { vi.advanceTimersByTime(4_100) })
      expect(onDismissNotice).toHaveBeenCalledWith(7)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the generic confirmation when the session named no account', () => {
    overlay({ open: false, notice: { id: 8, kind: 'signed-in' } })
    expect(screen.getByRole('alert').textContent).toContain('browser.signedIn')
  })

  it('shows no notice while nothing finished in the background', () => {
    overlay({ open: false })
    expect(screen.queryByRole('alert')).toBeNull()
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

  it('offers the manual sign-in link while the browser hand-off waits', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const authorizeUrl = 'https://platform.birdcoder.com/iam/oauth/authorize?client_id=birdcoder&state=s'
    try {
      overlay({ open: true, step: 'browser', browserLink: authorizeUrl })
      const dialog = screen.getByRole('dialog')
      // The waiting card states where the login continues and offers the same
      // URL for a browser that never showed its window.
      expect(within(dialog).getByText('browser.copyLinkHint')).not.toBeNull()
      fireEvent.click(within(dialog).getByRole('button', { name: 'browser.copyLink' }))
      await vi.waitFor(() => { expect(writeText).toHaveBeenCalledWith(authorizeUrl) })
      await vi.waitFor(() => {
        expect(within(dialog).getByRole('button', { name: 'browser.linkCopied' })).not.toBeNull()
      })
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('keeps the copy action available when the clipboard refuses the write', async () => {
    const writeText = vi.fn(async (_text: string) => { throw new Error('denied') })
    const exec = vi.fn(() => false)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    try {
      overlay({ open: true, step: 'browser', browserLink: 'https://platform.example/iam/oauth/authorize?state=s' })
      const dialog = screen.getByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'browser.copyLink' }))
      await vi.waitFor(() => { expect(writeText).toHaveBeenCalled() })
      // A refused write shows no success state and leaves the control usable.
      expect(within(dialog).queryByRole('button', { name: 'browser.linkCopied' })).toBeNull()
      expect(within(dialog).getByRole('button', { name: 'browser.copyLink' })).not.toBeNull()
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
      Reflect.deleteProperty(document, 'execCommand')
    }
  })

  it('does not offer the manual link once the hand-off failed or has no URL', () => {
    overlay({ open: true, step: 'browser' })
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'browser.copyLink' })).toBeNull()
    cleanup()
    overlay({ open: true, step: 'browser', browserFailed: true, browserLink: 'https://platform.example/authorize?state=spent' })
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'browser.copyLink' })).toBeNull()
  })

  it('reports a failed browser hand-off instead of claiming the page opened', () => {
    overlay({ open: true, step: 'browser', browserFailed: true })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('browser.failedTitle')).not.toBeNull()
    expect(within(dialog).getByText('browser.failedDetail')).not.toBeNull()
    // Without a reported step the card keeps the generic recovery line only.
    expect(within(dialog).queryByText(/^browser\.reason\./)).toBeNull()
  })

  it('names the failing step of a browser hand-off', () => {
    overlay({ open: true, step: 'browser', browserFailed: true, browserFailure: { code: 'provider-denied', detail: 'access_denied' } })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('browser.reason.provider-denied')).not.toBeNull()
    // The callback's OAuth error is the only host reason a refused consent
    // carries, so it owns the diagnostics line.
    expect(within(dialog).getByTestId('iam-browser-failure-detail').textContent)
      .toBe('browser.failureDetailaccess_denied')
  })

  it('reports a hosted authorization that could not start instead of a denied consent', () => {
    overlay({
      open: true,
      step: 'browser',
      browserFailed: true,
      browserFailure: {
        code: 'provider-denied',
        message: 'The hosted authorization could not be started. Start the login again.',
        detail: 'server_error',
      },
    })
    const dialog = screen.getByRole('dialog')
    // No consent screen appeared, so the "cancelled or not approved" line would
    // misstate what happened.
    expect(within(dialog).getByText('browser.reason.provider-start-failed')).not.toBeNull()
    expect(within(dialog).queryByText('browser.reason.provider-denied')).toBeNull()
    // The page's own sentence is actionable; the OAuth error class alone is not.
    expect(within(dialog).getByTestId('iam-browser-failure-detail').textContent)
      .toBe('browser.failureDetailThe hosted authorization could not be started. Start the login again.')

    // `detail` is the OAuth error value here, so the panel names it as one
    // instead of calling `server_error` a detail.
    fireEvent.click(within(dialog).getByRole('button', { name: 'browser.details.show' }))
    const details = within(dialog).getByTestId('iam-browser-details')
    expect(details.textContent).toContain('browser.details.oauthError')
    expect(details.textContent).toContain('server_error')
    expect(details.textContent).not.toContain('browser.details.detail')
  })

  it('shows the host reason under the named step', () => {
    overlay({
      open: true,
      step: 'browser',
      browserFailed: true,
      browserFailure: { code: 'exchange-failed', message: 'OAuth authorization code is invalid or expired' },
    })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('browser.reason.exchange-failed')).not.toBeNull()
    expect(within(dialog).getByTestId('iam-browser-failure-detail').textContent)
      .toBe('browser.failureDetailOAuth authorization code is invalid or expired')
  })

  it('reports the transport reason rather than the runtime summary for a failed exchange', () => {
    overlay({
      open: true,
      step: 'browser',
      browserFailed: true,
      browserFailure: {
        code: 'exchange-failed',
        message: 'The desktop session exchange failed. Start the browser login again.',
        detail: 'installation is not bound to a deploy application (安装未绑定部署应用)',
      },
    })
    const dialog = screen.getByRole('dialog')
    // The summary only says "start again"; the server's rejection is what a
    // support report can act on, so it owns the diagnostics line.
    expect(within(dialog).getByTestId('iam-browser-failure-detail').textContent)
      .toBe('browser.failureDetailinstallation is not bound to a deploy application (安装未绑定部署应用)')
  })

  it('keeps the complete failure report behind the details link', () => {
    overlay({
      open: true,
      step: 'browser',
      browserFailed: true,
      browserFailure: {
        code: 'exchange-failed',
        message: 'The desktop session exchange failed. Start the browser login again.',
        detail: 'OAuth authorization code is invalid or expired',
        response: {
          status: 400,
          code: '40002',
          traceId: 'trace-1',
          body: '{\n  "code": 40002,\n  "detail": "OAuth authorization code is invalid or expired"\n}',
        },
      },
    })
    const dialog = screen.getByRole('dialog')
    // Collapsed by default: the card names the step, the details stay one
    // deliberate click away.
    const toggle = within(dialog).getByRole('button', { name: 'browser.details.show' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(dialog).queryByTestId('iam-browser-details')).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const details = within(dialog).getByTestId('iam-browser-details')
    // Every fact a support report needs, including the server's own answer.
    expect(details.textContent).toContain('browser.details.step')
    expect(details.textContent).toContain('exchange-failed')
    expect(details.textContent).toContain('browser.details.message')
    expect(details.textContent).toContain('browser.details.detail')
    expect(details.textContent).toContain('browser.details.status')
    expect(details.textContent).toContain('400')
    expect(details.textContent).toContain('browser.details.code')
    expect(details.textContent).toContain('40002')
    expect(details.textContent).toContain('browser.details.trace')
    expect(details.textContent).toContain('trace-1')
    // The response's own document is rendered whole, not summarized.
    expect(details.textContent).toContain('"code": 40002')
    expect(details.textContent).toContain('OAuth authorization code is invalid or expired')

    fireEvent.click(toggle)
    expect(within(dialog).queryByTestId('iam-browser-details')).toBeNull()
  })

  it('keeps one reason line on the card and the whole report in the details', () => {
    overlay({
      open: true,
      step: 'browser',
      browserFailed: true,
      browserFailure: {
        code: 'provider-denied',
        message: [
          'The hosted authorization could not be started. Start the login again.',
          'HTTP 400 · code 40001',
          'OAuth client birdcoder is registered on an installation that is not bound to a deploy application',
        ].join('\n'),
        detail: 'server_error',
      },
    })
    const dialog = screen.getByRole('dialog')
    // The page's sentence stays the actionable line; the server's report would
    // otherwise turn the card into a wall of text.
    expect(within(dialog).getByTestId('iam-browser-failure-detail').textContent)
      .toBe('browser.failureDetailThe hosted authorization could not be started. Start the login again.')

    fireEvent.click(within(dialog).getByRole('button', { name: 'browser.details.show' }))
    const details = within(dialog).getByTestId('iam-browser-details')
    expect(details.textContent).toContain('HTTP 400 · code 40001')
    expect(details.textContent).toContain('not bound to a deploy application')
    expect(details.textContent).toContain('server_error')
  })

  it('copies the complete failure report from the expanded details', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      overlay({
        open: true,
        step: 'browser',
        browserFailed: true,
        browserFailure: {
          code: 'exchange-failed',
          message: 'The desktop session exchange failed. Start the browser login again.',
          detail: 'OAuth authorization code is invalid or expired',
          response: {
            status: 400,
            code: '40002',
            traceId: 'trace-1',
            body: '{\n  "detail": "OAuth authorization code is invalid or expired"\n}',
          },
        },
      })
      const dialog = screen.getByRole('dialog')
      // The copy action belongs to the expanded report: it copies what is shown.
      expect(within(dialog).queryByRole('button', { name: 'browser.details.copy' })).toBeNull()
      fireEvent.click(within(dialog).getByRole('button', { name: 'browser.details.show' }))
      const copy = within(dialog).getByRole('button', { name: 'browser.details.copy' })
      // The action belongs under the report it copies, not beside the toggle.
      const panel = within(dialog).getByTestId('iam-browser-details')
      expect(panel.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
      fireEvent.click(copy)

      await vi.waitFor(() => { expect(writeText).toHaveBeenCalledOnce() })
      const report = writeText.mock.calls[0]?.[0]
      // One paste carries the runtime's codes and the server's own answer.
      expect(report).toContain('browser.details.step: exchange-failed')
      expect(report).toContain('browser.details.message: The desktop session exchange failed. Start the browser login again.')
      expect(report).toContain('browser.details.detail: OAuth authorization code is invalid or expired')
      expect(report).toContain('browser.details.response:')
      expect(report).toContain('browser.details.status: 400')
      expect(report).toContain('browser.details.code: 40002')
      expect(report).toContain('browser.details.trace: trace-1')
      expect(report).toContain('"detail": "OAuth authorization code is invalid or expired"')

      // Success feedback replaces the action label and reaches the live region.
      await vi.waitFor(() => {
        expect(within(dialog).getByRole('button', { name: 'browser.details.copied' })).not.toBeNull()
      })
      expect(within(dialog).getByRole('status').textContent).toBe('browser.details.copied')
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('offers the in-app sign-in from a failed browser hand-off', () => {
    const { onStartInAppLogin } = overlay({ open: true, step: 'browser', browserFailed: true })
    const dialog = screen.getByRole('dialog')
    // The failed card keeps the product's in-app fallback one click away
    // instead of sending the user back to the entry step to find it.
    fireEvent.click(within(dialog).getByRole('button', { name: 'entry.inAppLogin' }))
    expect(onStartInAppLogin).toHaveBeenCalledOnce()
  })

  it('does not offer the in-app fallback while the hand-off is waiting', () => {
    overlay({ open: true, step: 'browser' })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'entry.inAppLogin' })).toBeNull()
  })

  it('falls back to the generic reason for an unknown failure code', () => {
    overlay({ open: true, step: 'browser', browserFailed: true, browserFailure: { code: 'unexpected' } })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('browser.reason.unknown')).not.toBeNull()
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
