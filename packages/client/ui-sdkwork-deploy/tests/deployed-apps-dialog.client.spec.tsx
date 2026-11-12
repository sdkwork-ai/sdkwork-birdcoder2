// @vitest-environment jsdom
/**
 * The settings-menu "我的应用" drawer: the readiness states it decides
 * (unconfigured, signed out, ready), its client re-read on an environment
 * revision, the two-ledger tab switch, and the app ledger's facet / empty /
 * failure behavior over a real publishing service whose generated client is a
 * test double.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppKind, AppResponse, AppTemplateResponse, AppStatus } from '@sdkwork/deployments-app-sdk'
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

/** One owned template listing the drawer's template tab renders. */
function templateRow(over: {
  id?: string
  displayName?: string
  templateKey?: string
  status?: AppTemplateResponse['status']
  installCount?: string
  latestVersionUuid?: string
} = {}): AppTemplateResponse {
  return {
    id: over.id ?? 'tpl-1',
    templateKey: over.templateKey ?? 'starter-app',
    displayName: over.displayName ?? 'Starter App',
    summary: 'A starting point',
    description: '',
    appUuid: 'app-1',
    templateType: 'APP',
    categoryUuid: 'category-1',
    authorUserId: 'user-1',
    visibility: 'PRIVATE',
    pricingModel: 'FREE',
    priceMinor: '0',
    currency: 'CNY',
    status: over.status ?? 'PUBLISHED',
    isFeatured: false,
    installCount: over.installCount ?? '3',
    viewCount: '10',
    ...(over.latestVersionUuid === undefined ? {} : { latestVersionUuid: over.latestVersionUuid }),
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    version: '1',
  }
}

/** Clients for both ledgers, with the recorded calls exposed to the assertions. */
function drawerClients(options: {
  apps?: AppResponse[]
  templates?: AppTemplateResponse[]
} = {}): {
  clients: DeployHostClients
  listApps: ReturnType<typeof vi.fn>
  listTemplates: ReturnType<typeof vi.fn>
  listVersions: ReturnType<typeof vi.fn>
} {
  const listApps = vi.fn(async () => ({
    items: options.apps ?? [app()],
    pageInfo: { mode: 'offset', hasMore: false },
  }))
  const listTemplates = vi.fn(async () => ({
    items: options.templates ?? [templateRow({ latestVersionUuid: 'version-1' })],
    pageInfo: { mode: 'offset', hasMore: false },
  }))
  const listVersions = vi.fn(async () => ({
    items: [{ id: 'version-1', templateVersion: '1.2.0' }],
    pageInfo: { mode: 'offset', hasMore: false },
  }))
  const clients = {
    deployClient: {
      app: { list: listApps },
      template: {
        appTemplates: { list: listTemplates },
        appTemplateVersions: { list: listVersions },
      },
    },
    driveClient: {},
  } as unknown as DeployHostClients
  return { clients, listApps, listTemplates, listVersions }
}

/** Composed props over one host adapter, so a test can reopen the drawer. */
function composedProps(open: boolean, readClients: () => DeployHostClients): DeployedAppsDialogProps {
  return {
    open,
    onClose: () => {},
    host: { readClients } as unknown as DeployHost,
    startSignIn: () => {},
    useAvailable: (select: (value: boolean) => boolean) => select(true),
    useSignedIn: (select: (value: boolean) => boolean) => select(true),
    useRevision: (select: (value: number) => number) => select(0),
    t,
  } as DeployedAppsDialogProps
}

function dialog(state: DialogState = {}, props: Partial<DeployedAppsDialogProps> = {}) {
  const startSignIn = vi.fn()
  const drawer = drawerClients()
  const readClients = vi.fn(state.readClients ?? (() => drawer.clients))
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
  return { view, readClients, startSignIn, drawer }
}

describe('DeployedAppsDialog', () => {
  it('renders nothing while closed', () => {
    dialog({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('explains an unconfigured gateway instead of mounting the ledgers', () => {
    const { readClients } = dialog({ available: false })
    expect(screen.getByRole('dialog', { name: zh['deployments.title'] })).toBeTruthy()
    expect(screen.getByText(zh['deployments.notConfigured'])).toBeTruthy()
    expect(readClients).not.toHaveBeenCalled()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('offers sign-in while signed out and raises the shared surface', () => {
    const { startSignIn } = dialog({ signedIn: false })
    expect(screen.getByText(zh['deployments.signInRequired'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.signIn'] }))
    expect(startSignIn).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('falls back to the configuration notice when the client read throws', () => {
    dialog({
      readClients: () => { throw new Error('not configured') },
    })
    expect(screen.getByText(zh['deployments.notConfigured'])).toBeTruthy()
  })

  it('mounts the app ledger once ready and signed in', async () => {
    const { view } = dialog()
    expect(await view.findByText('Store')).toBeTruthy()
    expect(screen.getByRole('tab', { name: zh['deployments.tab.apps'] }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: zh['deployments.tab.templates'] }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tabpanel', { name: zh['deployments.tab.apps'] })).toBeTruthy()
    // The template tab has not been visited, so its ledger is neither mounted
    // nor announced.
    expect(screen.queryByRole('tabpanel', { name: zh['deployments.tab.templates'] })).toBeNull()
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(2)
  })

  it('keeps both tabpanels addressable from their tabs', async () => {
    const { view } = dialog()
    await view.findByText('Store')
    for (const label of [zh['deployments.tab.apps'], zh['deployments.tab.templates']]) {
      const controls = screen.getByRole('tab', { name: label }).getAttribute('aria-controls')
      expect(controls).toBeTruthy()
      expect(document.getElementById(controls!)).not.toBeNull()
    }
  })

  it('switches to the caller’s app templates and back without re-reading either ledger', async () => {
    const { view, drawer } = dialog()
    await view.findByText('Store')
    fireEvent.click(screen.getByRole('tab', { name: zh['deployments.tab.templates'] }))

    const templatePanel = screen.getByRole('tabpanel', { name: zh['deployments.tab.templates'] })
    expect(await view.findByText('Starter App')).toBeTruthy()
    expect(screen.getByRole('tab', { name: zh['deployments.tab.templates'] }).getAttribute('aria-selected')).toBe('true')
    // The visited app ledger stays mounted but hidden: its rows leave the
    // accessibility tree while its state stays available for the switch back.
    expect(screen.queryByRole('tabpanel', { name: zh['deployments.tab.apps'] })).toBeNull()
    expect(screen.getByText('Store')).toBeTruthy()
    expect(await within(templatePanel).findByText('v1.2.0')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: zh['deployments.tab.apps'] }))
    expect(screen.getByRole('tabpanel', { name: zh['deployments.tab.apps'] })).toBeTruthy()
    expect(screen.queryByRole('tabpanel', { name: zh['deployments.tab.templates'] })).toBeNull()
    expect(screen.getByText('Store')).toBeTruthy()
    // Neither ledger reloaded: switching only changes which panel is hidden.
    expect(drawer.listApps).toHaveBeenCalledTimes(1)
    expect(drawer.listTemplates).toHaveBeenCalledTimes(1)
  })

  it('resets to 我的应用 when reopened and does not mount the template ledger', async () => {
    const drawer = drawerClients()
    const view = render(<DeployedAppsDialog {...composedProps(true, () => drawer.clients)} />)
    await view.findByText('Store')
    fireEvent.click(screen.getByRole('tab', { name: zh['deployments.tab.templates'] }))
    await view.findByText('Starter App')
    expect(drawer.listTemplates).toHaveBeenCalledTimes(1)

    view.rerender(<DeployedAppsDialog {...composedProps(false, () => drawer.clients)} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    view.rerender(<DeployedAppsDialog {...composedProps(true, () => drawer.clients)} />)
    expect(await screen.findByText('Store')).toBeTruthy()
    expect(screen.getByRole('tab', { name: zh['deployments.tab.apps'] }).getAttribute('aria-selected')).toBe('true')
    expect(drawer.listApps).toHaveBeenCalledTimes(2)
    expect(drawer.listTemplates).toHaveBeenCalledTimes(1)
  })

  it('re-reads the clients when the environment revision moves', () => {
    const readClients = vi.fn(() => drawerClients().clients)
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
