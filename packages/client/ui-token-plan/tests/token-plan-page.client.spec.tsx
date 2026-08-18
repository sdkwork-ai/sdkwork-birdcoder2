// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { TokenPlanPage, type TokenPlanPageProps } from '../src/client/TokenPlanPage.tsx'

vi.mock('@sdkwork/membership-pc-subscription/catalog', () => ({
  SdkworkSubscriptionCatalogPage: () => <div data-testid="token-plan-catalog">catalog</div>,
  sdkworkSubscriptionCatalogHostComponents: {},
}))

vi.mock('../src/client/commerce-components.tsx', () => ({
  createTokenPlanCommerceComponents: () => ({}),
}))

let configured = false

vi.mock('../src/client/token-plan-service.ts', () => ({
  TokenPlanService: class {
    isConfigured(): boolean { return configured }
    openSignIn(): void {}
    readCommerce(): { checkout: object } { return { checkout: {} } }
    subscribe(): () => void { return () => {} }
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
const iam = { controller: { getState: () => ({ session: null }), subscribe: () => () => {} }, openSignIn: () => {} }

function renderPage(colorScheme: 'light' | 'dark') {
  const theme = {
    getColorScheme: () => colorScheme,
    subscribe: () => () => {},
  }
  return render(
    <TokenPlanPage {...standard} env={env} iam={iam} mode="token-plan" t={t} theme={theme} />,
  )
}

describe('TokenPlanPage host chrome', () => {
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

  it('applies the dark class and mounts the catalog when configured', () => {
    configured = true
    const { container, getByTestId } = renderPage('dark')
    const surface = container.querySelector('[data-token-plan-surface="sdkwork"]')!
    expect(surface.classList.contains('dark')).toBe(true)
    expect(surface.getAttribute('data-sdk-color-mode')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('dark')
    expect(getByTestId('token-plan-catalog')).toBeTruthy()
  })
})
