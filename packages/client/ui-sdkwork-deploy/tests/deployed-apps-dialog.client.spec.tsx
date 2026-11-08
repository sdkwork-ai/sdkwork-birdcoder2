// @vitest-environment jsdom
/**
 * The settings-menu "我的应用部署" drawer: the three states it decides
 * (unconfigured, signed out, ready), its client re-read on an environment
 * revision, and the ledger's facet / empty / failure behavior over a real
 * publishing service whose generated client is a test double.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppKind, AppResponse, AppStatus } from '@sdkwork/deployments-app-sdk'
import type { DeployHost, DeployHostClients } from '../src/client/deployHost.ts'
import { DeployedAppsDialog, type DeployedAppsDialogProps } from '../src/client/DeployedAppsDialog.tsx'
import { DeployedAppsPanel, type DeployedAppsPanelProps } from '../src/client/DeployedAppsPanel.tsx'
import { APP_STATUS_LABEL_KEYS, OWNED_APPS_PAGE_SIZE } from '../src/client/deployedApps.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: DeployKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as DeployedAppsPanelProps['t']

/** One `deploy_app` row the ledger renders. */
function app(over: {
  id?: string
  name?: string
  slug?: string
  appKind?: AppKind
  appStatus?: AppResponse['appStatus']
  updatedAt?: string
  latestReleaseTag?: string
} = {}): AppResponse {
  return {
    id: over.id ?? over.name ?? 'app-1',
    name: over.name ?? 'Store',
    slug: over.slug ?? 'store',
    appKind: over.appKind ?? 'SPA_WEB',
    appStatus: over.appStatus ?? 'ACTIVE',
    defaultEnvironment: 'production',
    ownerType: 'USER',
    tenantId: 'tenant-1',
    nginxConfigOverridden: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: over.updatedAt ?? '2026-01-02T00:00:00Z',
    version: '1',
    ...(over.latestReleaseTag === undefined ? {} : { latestReleaseTag: over.latestReleaseTag }),
  }
}

/** Listing state the fake generated client answers from. */
interface Listing {
  items: AppResponse[]
  pageItems?: (page: number) => AppResponse[]
  fail?: boolean
  pageInfo?: { hasMore?: boolean }
}

/** Clients over one mutable listing, recording the list parameters. */
function clientsOf(listing: Listing): { clients: DeployHostClients; list: ReturnType<typeof vi.fn> } {
  const list = vi.fn(async (params: { page: number }) => {
    if (listing.fail === true) throw new Error('offline')
    return {
      items: listing.pageItems?.(params.page) ?? listing.items,
      pageInfo: listing.pageInfo ?? { mode: 'offset', hasMore: false },
    }
  })
  const clients = {
    deployClient: { app: { list } },
    driveClient: {},
  } as unknown as DeployHostClients
  return { clients, list }
}

function panel(listing: Listing) {
  const { clients, list } = clientsOf(listing)
  const props = { clients, t } as DeployedAppsPanelProps
  return { view: render(<DeployedAppsPanel {...props} />), list }
}

describe('DeployedAppsPanel', () => {
  it('lists the signed-in user’s own applications, newest first', async () => {
    const { view } = panel({
      items: [
        app({ id: 'old', name: 'Old Store', updatedAt: '2026-01-01T00:00:00Z' }),
        app({ id: 'new', name: 'New Store', updatedAt: '2026-03-01T00:00:00Z', latestReleaseTag: 'v1.2.0' }),
      ],
    })
    expect(await view.findByText('New Store')).toBeTruthy()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('New Store'),
      expect.stringContaining('Old Store'),
    ])
    expect(screen.getByText('v1.2.0')).toBeTruthy()
    expect(screen.getAllByText(zh['deployments.status.active'])).toHaveLength(2)
    expect(screen.getByText(zh['deployments.shownCount'].replace('{shown}', '2').replace('{total}', '2'))).toBeTruthy()
  })

  it('reads only the caller-owned scope', async () => {
    const { view, list } = panel({ items: [app()] })
    await view.findByText('Store')
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'USER', page: 1, pageSize: OWNED_APPS_PAGE_SIZE }))
  })

  it('narrows by application kind and clears the facet', async () => {
    const { view } = panel({
      items: [
        app({ id: 'web', name: 'Web Store', appKind: 'SPA_WEB' }),
        app({ id: 'android', name: 'Android Store', appKind: 'ANDROID_APP' }),
        app({ id: 'android-2', name: 'Android Shop', appKind: 'ANDROID_APP' }),
      ],
    })
    await view.findByText('Web Store')
    const webChip = screen.getByRole('button', { name: new RegExp(zh['deployments.kind.spaWeb']) })
    const androidChip = screen.getByRole('button', { name: new RegExp(zh['deployments.kind.android']) })
    expect(webChip.getAttribute('aria-pressed')).toBe('false')
    expect(androidChip.textContent).toContain('2')

    fireEvent.click(androidChip)
    expect(androidChip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Web Store')).toBeNull()
    expect(screen.getByText('Android Shop')).toBeTruthy()

    // A second press removes the kind from the selection (OR facet toggles).
    fireEvent.click(androidChip)
    expect(androidChip.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Web Store')).toBeTruthy()

    fireEvent.click(androidChip)
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.clearFilters'] }))
    expect(screen.getByText('Web Store')).toBeTruthy()
    expect(screen.getByText('Android Shop')).toBeTruthy()
  })

  it('renders loading placeholders while the first read is in flight', () => {
    const list = vi.fn(() => new Promise<never>(() => {}))
    const clients = {
      deployClient: { app: { list } },
      driveClient: {},
    } as unknown as DeployHostClients
    render(<DeployedAppsPanel clients={clients} t={t} />)
    expect(screen.getByRole('status', { name: zh['deployments.loading'] })).toBeTruthy()
  })

  it('renders every deploy_app status with its localized label', async () => {
    const statuses: AppStatus[] = ['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'FAILED']
    const { view } = panel({
      items: statuses.map((appStatus, index) => app({
        id: `app-${index}`,
        name: `App ${index}`,
        appStatus,
      })),
    })
    await view.findByText('App 0')
    for (const appStatus of statuses) {
      expect(screen.getAllByText(zh[APP_STATUS_LABEL_KEYS[appStatus]]).length).toBeGreaterThan(0)
    }
  })

  it('drops a late failure after the drawer content unmounted', async () => {
    let rejectList: ((cause: Error) => void) | undefined
    const list = vi.fn(() => new Promise((_resolve, reject) => { rejectList = reject }))
    const clients = {
      deployClient: { app: { list } },
      driveClient: {},
    } as unknown as DeployHostClients
    const view = render(<DeployedAppsPanel clients={clients} t={t} />)
    view.unmount()
    await act(async () => {
      rejectList?.(new Error('late failure'))
      await Promise.resolve()
    })
    expect(document.body.textContent).not.toContain('late failure')
  })

  it('explains a filtered-empty set and lets the facet be cleared after a reload drops every selected kind', async () => {
    const listing: Listing = {
      items: [app({ id: 'android', name: 'Android Store', appKind: 'ANDROID_APP' })],
    }
    const { view } = panel(listing)
    await view.findByText('Android Store')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['deployments.kind.android']) }))
    expect(screen.getByText('Android Store')).toBeTruthy()

    // The next read no longer carries that kind: the facet has no chip for it,
    // yet the selection survives, so the ledger must explain the empty result.
    listing.items = [app({ id: 'web', name: 'Web Store', appKind: 'SPA_WEB' })]
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.refresh'] }))
    expect(await view.findByText(zh['deployments.filteredEmpty'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: new RegExp(zh['deployments.kind.android']) })).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: zh['deployments.clearFilters'] })[0]!)
    expect(await view.findByText('Web Store')).toBeTruthy()
  })

  it('renders the first-run empty state', async () => {
    const { view } = panel({ items: [] })
    expect(await view.findByText(zh['deployments.empty'])).toBeTruthy()
    expect(screen.getByText(zh['deployments.emptyHint'])).toBeTruthy()
  })

  it('reports a failed read and retries it', async () => {
    const listing: Listing = { items: [], fail: true }
    const { view } = panel(listing)
    const alert = await view.findByRole('alert')
    expect(alert.textContent).toContain(zh['deployments.loadFailed'].replace('{message}', 'offline'))

    listing.fail = false
    listing.items = [app({ name: 'Recovered Store' })]
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.retry'] }))
    expect(await view.findByText('Recovered Store')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('notes when the page ceiling cut the caller’s set short', async () => {
    const { view } = panel({
      items: [],
      pageItems: page => Array.from({ length: OWNED_APPS_PAGE_SIZE }, (_value, index) => app({
        id: `page-${page}-app-${index}`,
        name: `Store ${index}`,
      })),
      pageInfo: { hasMore: true },
    })
    expect(await view.findByText(zh['deployments.truncated'].replace('{count}', String(OWNED_APPS_PAGE_SIZE * 5)))).toBeTruthy()
  })
})

/** Dialog state overrides. */
interface DialogState {
  open?: boolean
  available?: boolean
  signedIn?: boolean
  revision?: number
  readClients?: () => DeployHostClients
}

function dialog(state: DialogState = {}, props: Partial<DeployedAppsDialogProps> = {}) {
  const startSignIn = vi.fn()
  const readClients = vi.fn(state.readClients ?? (() => clientsOf({ items: [app()] }).clients))
  const composed = {
    open: state.open ?? true,
    onClose: () => {},
    host: { readClients } as unknown as DeployHost,
    startSignIn,
    useAvailable: (select: (value: boolean) => boolean) => select(state.available ?? true),
    useSignedIn: (select: (value: boolean) => boolean) => select(state.signedIn ?? true),
    useRevision: (select: (value: number) => number) => select(state.revision ?? 0),
    t,
    ...props,
  } as DeployedAppsDialogProps
  const view = render(<DeployedAppsDialog {...composed} />)
  return { view, readClients, startSignIn }
}

describe('DeployedAppsDialog', () => {
  it('renders nothing while closed', () => {
    dialog({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('explains an unconfigured gateway instead of mounting the ledger', () => {
    const { readClients } = dialog({ available: false })
    expect(screen.getByRole('dialog', { name: zh['deployments.title'] })).toBeTruthy()
    expect(screen.getByText(zh['deployments.notConfigured'])).toBeTruthy()
    expect(readClients).not.toHaveBeenCalled()
  })

  it('offers sign-in while signed out and raises the shared surface', () => {
    const { startSignIn } = dialog({ signedIn: false })
    expect(screen.getByText(zh['deployments.signInRequired'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.signIn'] }))
    expect(startSignIn).toHaveBeenCalledTimes(1)
  })

  it('falls back to the configuration notice when the client read throws', () => {
    dialog({
      readClients: () => { throw new Error('not configured') },
    })
    expect(screen.getByText(zh['deployments.notConfigured'])).toBeTruthy()
  })

  it('mounts the ledger once ready and signed in', async () => {
    const { view } = dialog()
    expect(await view.findByText('Store')).toBeTruthy()
  })

  it('re-reads the clients when the environment revision moves', () => {
    const readClients = vi.fn(() => clientsOf({ items: [] }).clients)
    const base = {
      open: true,
      onClose: () => {},
      host: { readClients } as unknown as DeployHost,
      startSignIn: () => {},
      useAvailable: (select: (value: boolean) => boolean) => select(true),
      useSignedIn: (select: (value: boolean) => boolean) => select(true),
      t,
    }
    const { rerender } = render(<DeployedAppsDialog {...{
      ...base,
      useRevision: (select: (value: number) => number) => select(0),
    } as unknown as DeployedAppsDialogProps} />)
    expect(readClients).toHaveBeenCalledTimes(1)
    rerender(<DeployedAppsDialog {...{
      ...base,
      useRevision: (select: (value: number) => number) => select(1),
    } as unknown as DeployedAppsDialogProps} />)
    expect(readClients).toHaveBeenCalledTimes(2)
  })
})
