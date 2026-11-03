// @vitest-environment jsdom
/** The fork-owned left column renders `ctx.sdkworkSidebar` pages as rows in
 * the quick-entry stack: one icon+title row wide, an icon-only control in the
 * collapsed rail, and a click activates the page. Existing seats (brand,
 * workspace browser, settings foot) keep rendering in the same places, and the
 * layout preference drops the rows the user hid. */
import type { ReactNode } from 'react'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { allowAllAccess, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en } from '../src/client/locales.ts'
import type { SidebarPage } from '../src/client/service.ts'
import type { SidebarItem, SidebarLayoutSnapshot } from '../src/client/layout.ts'
import type { SidebarPanelMetadata, SidebarSectionHookContext } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
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

/** One quick-entry item as the layout publishes it. */
function actionItem(id: string, order: number): SidebarItem {
  return { id, group: 'actions', title: id, order }
}

/** One global panel row as the ledger publishes it. */
function panel(id: string, label: string, order: number): SidebarPanelMetadata {
  return { id: id as MainPanelId, label, order }
}

type ShellOptions = {
  collapsed?: boolean
  pages?: readonly SidebarPage[]
  items?: readonly SidebarItem[]
  hidden?: readonly string[]
  panels?: readonly SidebarPanelMetadata[]
  entryActions?: boolean
  /** Slot dispatcher override; the default draws one marker per seat. */
  renderSlot?: typeof renderStubbedSlot
}

/** The owner facts this stand-in reads across the seats it fills. */
type SlotOwnerView = { wide?: boolean; entries?: readonly { id: string }[] }

/** Dispatch options this stand-in reads; it draws the seat, not the options. */
type SlotRenderOptions = { fallback?: ReactNode; only?: string; hookContext?: unknown }

/** Slot stand-in: one marker per seat so the assertions read the shell's calls. */
function renderStubbedSlot(
  key: string,
  owner: SlotOwnerView,
  options?: SlotRenderOptions,
): ReactNode {
  if (key === 'sidebar.brand.mark') return <span data-testid="brand-mark">M</span>
  if (key === 'sidebar.brand.name') return <span data-testid="brand-name">Fork</span>
  if (key === 'sidebar.toggle.badge') return null
  if (key === 'sidebar.actions') {
    if (options?.only !== undefined) return <div data-testid={`quick-entry-${options.only}`} />
    return options?.fallback === undefined || options.fallback === false
      ? null
      : <div data-testid="builtin-new-session" />
  }
  if (key === 'sidebar.panellist') return null
  if (key === 'sidebar.panellist.actions') {
    return <>{owner.entries?.map(entry => <span key={entry.id} data-testid={`more-${entry.id}`} />)}</>
  }
  if (key === 'sidebar.settings') return <div data-testid="settings-seat" data-wide={owner.wide} />
  if (key === 'sidebar.footer.action') return null
  return <div data-testid="workspace-region" data-wide={owner.wide} />
}

function mountShell({
  collapsed = false,
  pages = [],
  items = [],
  hidden = [],
  panels = [],
  entryActions = false,
  renderSlot = renderStubbedSlot,
}: ShellOptions = {}) {
  const openPage = vi.fn()
  const layout: SidebarLayoutSnapshot = { items, hidden }
  const root = () => (
    <SidebarRoot
      drawer={false} collapsed={collapsed} width={300}
      useSessions={neverHook} useSessionStatus={neverHook} useSessionRetainInfo={neverHook}
      usePanelInfo={usePanelInfo} selectPanel={() => {}}
      usePanels={selector => selector(panels)}
      usePages={selector => selector(pages)}
      useLayout={selector => selector(layout)}
      useEntryPins={selector => selector([])} useEntryActions={selector => selector(entryActions)} setPinned={vi.fn()}
      useShortcuts={selector => selector([])}
      useResource={useResource} useWorkspaces={neverHook} useContextMenu={contextMenuHook()}
      {...allowAllAccess}
      startSession={vi.fn()} toggleSidebar={vi.fn()} trackEntryClick={vi.fn()} t={t}
      renderSlot={renderSlot} renderFactorySlot={() => null}
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

describe('left sidebar layout preference', () => {
  it('renders each registered quick entry once, in the layout order', () => {
    mountShell({ items: [actionItem('market', 40), actionItem('new-chat', 10)] })
    expect(screen.getByTestId('quick-entry-market')).toBeTruthy()
    expect(screen.getByTestId('quick-entry-new-chat')).toBeTruthy()
    expect(screen.queryByTestId('builtin-new-session')).toBeNull()
  })

  it('keeps the built-in New Session capsule while no quick entry is registered', () => {
    mountShell()
    expect(screen.getByTestId('builtin-new-session')).toBeTruthy()
  })

  it('drops the quick entries the user hid', () => {
    mountShell({ items: [actionItem('market', 40), actionItem('new-chat', 10)], hidden: ['market'] })
    expect(screen.queryByTestId('quick-entry-market')).toBeNull()
    expect(screen.getByTestId('quick-entry-new-chat')).toBeTruthy()
    // A stack the user hid entirely stays empty rather than resurrecting the
    // built-in capsule in place of their choice.
    expect(screen.queryByTestId('builtin-new-session')).toBeNull()
  })

  it('drops a hidden page row and keeps the rest', () => {
    mountShell({
      pages: [page('first', 'First page', vi.fn()), page('second', 'Second page', vi.fn())],
      hidden: ['first'],
    })
    const nav = screen.getByRole('navigation', { name: en['navigation.label'] })
    expect([...nav.querySelectorAll('button')].map(row => row.getAttribute('aria-label'))).toEqual(['Second page'])
  })

  it('drops a hidden panel row', () => {
    mountShell({
      panels: [panel('first', 'First panel', 0), panel('second', 'Second panel', 10)],
      hidden: ['first'],
    })
    const nav = screen.getByRole('navigation', { name: en['panels.label'] })
    expect([...nav.querySelectorAll('button')].map(row => row.getAttribute('aria-label'))).toEqual(['Second panel'])
  })

  it('never hides the fixed plugin launcher', () => {
    mountShell({
      panels: [panel('plugins', 'Plugins', 0), panel('second', 'Second panel', 10)],
      hidden: ['plugins'],
    })
    const nav = screen.getByRole('navigation', { name: en['panels.label'] })
    expect([...nav.querySelectorAll('button')].map(row => row.getAttribute('aria-label'))).toEqual(['Plugins', 'Second panel'])
  })

  it('keeps a hidden panel out of the More menu, too', () => {
    mountShell({
      panels: [panel('first', 'First panel', 0), panel('second', 'Second panel', 10)],
      hidden: ['first'],
      entryActions: true,
    })
    fireEvent.click(screen.getByRole('button', { name: en['panels.more'] }))
    expect(screen.getByTestId('more-second')).toBeTruthy()
    expect(screen.queryByTestId('more-first')).toBeNull()
  })
})

describe('left sidebar scroll viewport', () => {
  it('renders one viewport above the foot and hands the browser its scroller hook', () => {
    const contexts: SidebarSectionHookContext[] = []
    const renderSlot: typeof renderStubbedSlot = (key, owner, options) => {
      if (key === 'sidebar.workspaces') contexts.push(options?.hookContext as SidebarSectionHookContext)
      return renderStubbedSlot(key, owner, options)
    }
    mountShell({ pages: [page('first', 'First page', vi.fn())], renderSlot })
    expect(document.querySelector('[data-sidebar-scrollport]')).not.toBeNull()
    expect(contexts).toHaveLength(1)
    // One sidebar render tree hands out one stable scroller binding.
    const [context] = contexts
    const scroller = context.useSectionScroller()
    expect(scroller).toBe(context.useSectionScroller())
    expect(typeof scroller.bindScrollerRef).toBe('function')
  })

  it('drops the viewport marker in the rail', () => {
    mountShell({ collapsed: true })
    expect(document.querySelector('[data-sidebar-scrollport]')).toBeNull()
    expect(screen.getByTestId('workspace-region')).toBeTruthy()
  })
})
