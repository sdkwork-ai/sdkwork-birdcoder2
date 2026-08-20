// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TokenPlanPage, type TokenPlanPageProps } from '../src/client/TokenPlanPage.tsx'

vi.mock('@sdkwork/membership-pc-subscription/catalog', () => ({
  SdkworkSubscriptionCatalogPage: (props: {
    notifyOutlet?: () => unknown
    onLoginRequired?: () => void
    onNotify?: (message: string, tone: 'error' | 'info' | 'success') => void
  }) => {
    const Outlet = props.notifyOutlet
    return (
      <div data-testid="token-plan-catalog">
        {Outlet ? <Outlet /> : null}
        <button type="button" onClick={() => props.onLoginRequired?.()}>login</button>
        <button type="button" onClick={() => props.onNotify?.('paid', 'success')}>notify-success</button>
        <button type="button" onClick={() => props.onNotify?.('wait', 'info')}>notify-info</button>
        <button type="button" onClick={() => props.onNotify?.('fail', 'error')}>notify-error</button>
      </div>
    )
  },
  sdkworkSubscriptionCatalogHostComponents: {},
}))

let capturedOnCompleted: (() => void) | undefined
vi.mock('../src/client/commerce-components.tsx', () => ({
  createTokenPlanCommerceComponents: (options: { onCompleted: () => void }) => {
    capturedOnCompleted = options.onCompleted
    return {}
  },
}))

let configured = false
let serviceListener: (() => void) | undefined
const openSignIn = vi.fn()

vi.mock('../src/client/token-plan-service.ts', () => ({
  TokenPlanService: class {
    isConfigured(): boolean { return configured }
    openSignIn(): void { openSignIn() }
    readCommerce(): { checkout: object } { return { checkout: {} } }
    subscribe(listener: () => void): () => void {
      serviceListener = listener
      return () => { serviceListener = undefined }
    }
  },
}))

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {},
    jobsBySession: {}, currentAddress: undefined,
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
}

const t = ((key: string) => key) as TokenPlanPageProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }
const env = { isConfigured: () => configured, apiBaseUrl: () => '', accessToken: () => '', subscribe: () => () => {} }
const iam = { controller: { getState: () => ({ session: null }), subscribe: () => () => {} }, openSignIn }

function renderPage(colorScheme: 'light' | 'dark', schemeRef?: { current: 'light' | 'dark' }) {
  let themeListener: (() => void) | undefined
  const theme = {
    getColorScheme: () => schemeRef?.current ?? colorScheme,
    subscribe: (listener: () => void) => {
      themeListener = listener
      return () => { themeListener = undefined }
    },
  }
  const view = render(
    <TokenPlanPage {...standard} env={env} iam={iam} mode="token-plan" t={t} theme={theme} />,
  )
  return {
    ...view,
    fireTheme: () => { themeListener?.() },
  }
}

describe('TokenPlanPage host chrome', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('keeps light mode without the dark class and shows the unconfigured copy', () => {
    configured = false
    const { container } = renderPage('light')
    const surface = container.querySelector('[data-token-plan-surface="sdkwork"]')!
    expect(surface.classList.contains('dark')).toBe(false)
    expect(surface.getAttribute('data-sdk-color-mode')).toBe('light')
    expect(container.querySelector('[data-sdk-theme-provider]')?.getAttribute('data-theme')).toBe('tech-blue')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('light')
    expect(surface.textContent).toContain('page.unconfigured')
    const catalog = surface.querySelector('[data-token-plan-catalog]')
    expect(catalog).not.toBeNull()
    expect(catalog?.className).toContain('max-w-7xl')
  })

  it('declares a four-column catalog plan grid that does not wait on the lg viewport', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/client/ui-token-plan/src/client/tokenPlan.css'), 'utf8')
    expect(css).toContain('[data-token-plan-catalog] .grid[class*="lg:grid-cols-4"]')
    expect(css).toContain('[data-token-plan-catalog] .grid[class*="md:grid-cols-2"][class*="lg:grid-cols-4"]')
    expect(css).toContain('repeat(4, minmax(0, 1fr))')
  })

  it('applies the dark class and mounts checkout after sign-in and payment completion', () => {
    vi.useFakeTimers()
    configured = true
    const scheme = { current: 'dark' as 'light' | 'dark' }
    const view = renderPage('dark', scheme)
    const surface = view.container.querySelector('[data-token-plan-surface="sdkwork"]')!
    expect(surface.classList.contains('dark')).toBe(true)
    expect(surface.getAttribute('data-sdk-color-mode')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('dark')
    expect(view.getByTestId('token-plan-catalog')).toBeTruthy()
    act(() => { serviceListener?.() })
    fireEvent.click(view.getByText('login'))
    expect(openSignIn).toHaveBeenCalled()
    act(() => { capturedOnCompleted?.() })
    fireEvent.click(view.getByText('notify-success'))
    expect(view.getByRole('status').textContent).toContain('paid')
    fireEvent.click(view.getByLabelText('notify.close'))
    fireEvent.click(view.getByText('notify-info'))
    expect(view.getByRole('status').textContent).toContain('wait')
    act(() => { vi.runOnlyPendingTimers() })
    fireEvent.click(view.getByText('notify-error'))
    expect(view.getByRole('status').textContent).toContain('fail')
    scheme.current = 'light'
    act(() => { view.fireTheme() })
    expect(view.container.querySelector('[data-token-plan-surface="sdkwork"]')?.classList.contains('dark')).toBe(false)
    vi.useRealTimers()
  })
})
