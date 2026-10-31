// @vitest-environment jsdom
/** The fork-owned left column renders `ctx.sdkworkSidebar` pages as rows in
 * the quick-entry stack: one icon+title row wide, an icon-only control in the
 * collapsed rail, and a click activates the page. Existing seats (brand,
 * workspace browser, settings foot) keep rendering in the same places. */
import type { ReactNode } from 'react'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { allowAllAccess, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en } from '../src/client/locales.ts'
import type { SidebarPage } from '../src/client/service.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const t = makeTranslate({ ...commonEn, ...en })

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never

function page(id: string, title: string, open: () => void): SidebarPage {
  return {
    id,
    title,
    order: 0,
    open,
    icon: ({ size }: { size: number }) => <span data-testid={`glyph-${id}`} data-size={size} />,
  }
}

function mountShell({ collapsed = false, pages = [] as readonly SidebarPage[] } = {}) {
  const openPage = vi.fn()
  const root = () => (
    <SidebarRoot
      drawer={false} collapsed={collapsed} width={300}
      useSessions={neverHook} useSessionStatus={neverHook} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}} usePanels={selector => selector([])}
      usePages={selector => selector(pages)}
      useEntryPins={selector => selector([])} useEntryActions={selector => selector(false)} setPinned={vi.fn()}
      useShortcuts={selector => selector([])}
      useResource={useResource} useWorkspaces={neverHook}
      {...allowAllAccess}
      startSession={vi.fn()} toggleSidebar={vi.fn()} trackEntryClick={vi.fn()} t={t}
      renderSlot={((key: string, owner: { wide?: boolean }, options?: { fallback?: ReactNode }) => {
        if (key === 'sidebar.brand.mark') return <span data-testid="brand-mark">M</span>
        if (key === 'sidebar.brand.name') return <span data-testid="brand-name">Fork</span>
        if (key === 'sidebar.toggle.badge') return null
        if (key === 'sidebar.actions') return options?.fallback ?? null
        if (key === 'sidebar.settings') return <div data-testid="settings-seat" data-wide={owner.wide} />
        if (key === 'sidebar.footer.action') return null
        return <div data-testid="workspace-region" data-wide={owner.wide} />
      })}
    />
  )
  const view = render(root())
  return { view, openPage }
}

describe('left sidebar page rows', () => {
  it('renders no page list when the registry is empty', () => {
    mountShell()
    expect(screen.queryByRole('navigation', { name: en['navigation.label'] })).toBeNull()
    expect(screen.getByTestId('workspace-region')).toBeTruthy()
    expect(screen.getByTestId('settings-seat')).toBeTruthy()
  })

  it('renders one wide row per page, in order, and activates it on click', () => {
    const open = vi.fn()
    mountShell({ pages: [page('first', 'First page', vi.fn()), page('second', 'Second page', open)] })
    const nav = screen.getByRole('navigation', { name: en['navigation.label'] })
    const rows = [...nav.querySelectorAll('button')]
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['First page', 'Second page'])
    fireEvent.click(rows[1])
    expect(open).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('glyph-second').getAttribute('data-size')).toBe('16')
  })

  it('keeps the collapsed rail icon-only', () => {
    mountShell({ collapsed: true, pages: [page('first', 'First page', vi.fn())] })
    const nav = screen.getByRole('navigation', { name: en['navigation.label'] })
    const [row] = [...nav.querySelectorAll('button')]
    expect(row?.textContent).toBe('')
    expect(row?.getAttribute('aria-label')).toBe('First page')
    expect(screen.getByTestId('glyph-first').getAttribute('data-size')).toBe('18')
  })

  it('renders pages above the workspace browser and below the quick entries', () => {
    mountShell({ pages: [page('first', 'First page', vi.fn())] })
    const root = screen.getByTestId('workspace-region')
    const nav = screen.getByRole('navigation', { name: en['navigation.label'] })
    expect(nav.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
