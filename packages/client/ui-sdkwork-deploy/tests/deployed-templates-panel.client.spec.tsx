// @vitest-environment jsdom
/**
 * The settings-menu drawer's template ledger: the paged account read, the
 * status facet, the version and install badges, and the loading / empty /
 * failure / truncation behavior over a generated-client test double.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppTemplateResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployHostClients } from '../src/client/deployHost.ts'
import { DeployedTemplatesPanel, type DeployedTemplatesPanelProps } from '../src/client/DeployedTemplatesPanel.tsx'
import { OWNED_TEMPLATES_MAX_PAGES, OWNED_TEMPLATES_PAGE_SIZE } from '../src/client/deployedTemplates.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: DeployKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as DeployedTemplatesPanelProps['t']

/** One owned template listing the panel renders. */
function template(over: Partial<AppTemplateResponse> = {}): AppTemplateResponse {
  return {
    id: over.id ?? 'tpl-1',
    templateKey: 'starter-app',
    displayName: 'Starter App',
    summary: '',
    description: '',
    appUuid: 'app-1',
    templateType: 'APP',
    categoryUuid: 'category-1',
    authorUserId: 'user-1',
    visibility: 'PRIVATE',
    pricingModel: 'FREE',
    priceMinor: '0',
    currency: 'CNY',
    status: 'PUBLISHED',
    isFeatured: false,
    installCount: '0',
    viewCount: '0',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    version: '1',
    ...over,
  }
}

/** Listing state the fake generated client answers from. */
interface Listing {
  items: AppTemplateResponse[]
  pageItems?: (page: number) => AppTemplateResponse[]
  fail?: boolean
  pageInfo?: { hasMore?: boolean }
  /** Version reads by template id; a throw simulates an unreadable page. */
  versions?: (templateId: string) => Promise<{ items: { id: string; templateVersion?: string }[] }>
}

/** Clients over one mutable listing, recording the list and version calls. */
function clientsOf(listing: Listing): {
  clients: DeployHostClients
  list: ReturnType<typeof vi.fn>
  listVersions: ReturnType<typeof vi.fn>
} {
  const list = vi.fn(async (params: { page: number }) => {
    if (listing.fail === true) throw new Error('offline')
    return {
      items: listing.pageItems?.(params.page) ?? listing.items,
      pageInfo: listing.pageInfo ?? { mode: 'offset', hasMore: false },
    }
  })
  const listVersions = vi.fn(async (templateId: string) => {
    if (listing.versions !== undefined) return listing.versions(templateId)
    return { items: [{ id: 'version-1', templateVersion: '1.2.0' }] }
  })
  const clients = {
    deployClient: {
      template: {
        appTemplates: { list },
        appTemplateVersions: { list: listVersions },
      },
    },
    driveClient: {},
  } as unknown as DeployHostClients
  return { clients, list, listVersions }
}

function panel(listing: Listing) {
  const { clients, list, listVersions } = clientsOf(listing)
  const props = { clients, t } as DeployedTemplatesPanelProps
  return { view: render(<DeployedTemplatesPanel {...props} />), list, listVersions }
}

describe('DeployedTemplatesPanel', () => {
  it('lists the account’s templates newest first with key, status, version and installs', async () => {
    const { view, list } = panel({
      items: [
        template({
          id: 'old',
          displayName: 'Old Scaffold',
          templateKey: 'old-scaffold',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
        template({
          id: 'new',
          displayName: 'New Scaffold',
          templateKey: 'new-scaffold',
          updatedAt: '2026-03-01T00:00:00Z',
          installCount: '42',
          latestVersionUuid: 'version-1',
          summary: 'A batteries-included starting point',
        }),
      ],
    })
    expect(await view.findByText('New Scaffold')).toBeTruthy()
    expect(list).toHaveBeenCalledWith(
      { page: 1, pageSize: OWNED_TEMPLATES_PAGE_SIZE },
      { signal: expect.any(AbortSignal) },
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('New Scaffold'),
      expect.stringContaining('Old Scaffold'),
    ])
    expect(screen.getByText('new-scaffold')).toBeTruthy()
    expect(screen.getByText('v1.2.0')).toBeTruthy()
    expect(screen.getByText(zh['deployments.templates.installs'].replace('{count}', '42'))).toBeTruthy()
    expect(screen.getByText('A batteries-included starting point')).toBeTruthy()
    expect(screen.getAllByText(zh['templateCenter.download.status.published'])).toHaveLength(3)
    expect(within(rows[0]!).getByText(zh['templateCenter.download.status.published'])).toBeTruthy()
    expect(screen.getByText(zh['deployments.shownCount'].replace('{shown}', '2').replace('{total}', '2'))).toBeTruthy()
    expect(screen.getByText(zh['deployments.updatedAt'].replace('{time}', '2026-03-01 00:00'))).toBeTruthy()
  })

  it('hides the install and version badges a listing cannot support', async () => {
    const { view } = panel({
      items: [template({ displayName: 'Quiet Scaffold', installCount: '0' })],
    })
    await view.findByText('Quiet Scaffold')
    expect(screen.queryByText(/安装/u)).toBeNull()
    expect(screen.queryByText(/^v/u)).toBeNull()
  })

  it('narrows by status and clears the facet', async () => {
    const { view } = panel({
      items: [
        template({ id: 'published', displayName: 'Published App', status: 'PUBLISHED' }),
        template({ id: 'draft', displayName: 'Draft App', status: 'DRAFT' }),
        template({ id: 'draft-2', displayName: 'Second Draft', status: 'DRAFT' }),
      ],
    })
    await view.findByText('Published App')
    const publishedChip = screen.getByRole('button', {
      name: new RegExp(zh['templateCenter.download.status.published']),
    })
    const draftChip = screen.getByRole('button', { name: new RegExp(zh['templateCenter.download.status.draft']) })
    expect(publishedChip.getAttribute('aria-pressed')).toBe('false')
    expect(draftChip.textContent).toContain('2')

    fireEvent.click(draftChip)
    expect(draftChip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Published App')).toBeNull()
    expect(screen.getByText('Second Draft')).toBeTruthy()

    // A second press removes the status from the OR selection.
    fireEvent.click(draftChip)
    expect(draftChip.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Published App')).toBeTruthy()

    fireEvent.click(publishedChip)
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.clearFilters'] }))
    expect(screen.getByText('Draft App')).toBeTruthy()
    expect(screen.getByText('Published App')).toBeTruthy()
  })

  it('renders loading placeholders while the first read is in flight', () => {
    const list = vi.fn(() => new Promise<never>(() => {}))
    const clients = {
      deployClient: { template: { appTemplates: { list }, appTemplateVersions: { list: vi.fn() } } },
      driveClient: {},
    } as unknown as DeployHostClients
    render(<DeployedTemplatesPanel clients={clients} t={t} />)
    expect(screen.getByRole('status', { name: zh['deployments.templates.loading'] })).toBeTruthy()
  })

  it('renders every listing status with its localized label', async () => {
    const statuses: AppTemplateResponse['status'][] = [
      'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'DISABLED',
    ]
    const { view } = panel({
      items: statuses.map((status, index) => template({
        id: `tpl-${index}`,
        displayName: `Template ${index}`,
        status,
      })),
    })
    await view.findByText('Template 0')
    const rows = within(screen.getByRole('list'))
    expect(rows.getByText(zh['templateCenter.download.status.draft'])).toBeTruthy()
    expect(rows.getByText(zh['templateCenter.download.status.pending'])).toBeTruthy()
    expect(rows.getByText(zh['templateCenter.download.status.published'])).toBeTruthy()
    expect(rows.getByText(zh['templateCenter.download.status.rejected'])).toBeTruthy()
    expect(rows.getByText(zh['templateCenter.download.status.disabled'])).toBeTruthy()
  })

  it('keeps a row listed when its version read fails', async () => {
    const { view } = panel({
      items: [template({
        displayName: 'Unreadable Version',
        latestVersionUuid: 'version-1',
      })],
      versions: async () => { throw new Error('offline') },
    })
    expect(await view.findByText('Unreadable Version')).toBeTruthy()
    expect(screen.queryByText(/^v/u)).toBeNull()
  })

  it('drops a late failure after the tab unmounted', async () => {
    let rejectList: ((cause: Error) => void) | undefined
    const list = vi.fn(() => new Promise((_resolve, reject) => { rejectList = reject }))
    const clients = {
      deployClient: { template: { appTemplates: { list }, appTemplateVersions: { list: vi.fn() } } },
      driveClient: {},
    } as unknown as DeployHostClients
    const view = render(<DeployedTemplatesPanel clients={clients} t={t} />)
    view.unmount()
    await act(async () => {
      rejectList?.(new Error('late failure'))
      await Promise.resolve()
    })
    expect(document.body.textContent).not.toContain('late failure')
  })

  it('explains a filtered-empty set and lets the facet be cleared after a reload drops every selected status', async () => {
    const listing: Listing = {
      items: [template({ id: 'draft', displayName: 'Draft App', status: 'DRAFT' })],
    }
    const { view } = panel(listing)
    await view.findByText('Draft App')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh['templateCenter.download.status.draft']) }))
    expect(screen.getByText('Draft App')).toBeTruthy()

    // The next read no longer carries that status: the facet has no chip for
    // it, yet the selection survives, so the tab must explain the empty result.
    listing.items = [template({ id: 'published', displayName: 'Published App', status: 'PUBLISHED' })]
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.refresh'] }))
    expect(await view.findByText(zh['deployments.templates.filteredEmpty'])).toBeTruthy()
    expect(screen.queryByRole('button', {
      name: new RegExp(zh['templateCenter.download.status.draft']),
    })).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: zh['deployments.clearFilters'] })[0]!)
    expect(await view.findByText('Published App')).toBeTruthy()
  })

  it('renders the first-run empty state', async () => {
    const { view } = panel({ items: [] })
    expect(await view.findByText(zh['deployments.templates.empty'])).toBeTruthy()
    expect(screen.getByText(zh['deployments.templates.emptyHint'])).toBeTruthy()
  })

  it('reports a failed read and retries it', async () => {
    const listing: Listing = { items: [], fail: true }
    const { view } = panel(listing)
    const alert = await view.findByRole('alert')
    expect(alert.textContent).toContain(zh['deployments.templates.loadFailed'].replace('{message}', 'offline'))

    listing.fail = false
    listing.items = [template({ displayName: 'Recovered Scaffold' })]
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.retry'] }))
    expect(await view.findByText('Recovered Scaffold')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('notes when the page ceiling cut the account’s set short', async () => {
    const { view } = panel({
      items: [],
      pageItems: page => Array.from(
        { length: OWNED_TEMPLATES_PAGE_SIZE },
        (_unused, index) => template({ id: `page-${page}-${index}`, displayName: `Scaffold ${index}` }),
      ),
      pageInfo: { hasMore: true },
    })
    expect(await view.findByText(zh['deployments.templates.truncated']
      .replace('{count}', String(OWNED_TEMPLATES_PAGE_SIZE * OWNED_TEMPLATES_MAX_PAGES)))).toBeTruthy()
  })

  it('keeps the loaded rows and explains a failed refresh', async () => {
    const listing: Listing = { items: [template({ displayName: 'Stable Scaffold' })] }
    const { view } = panel(listing)
    await view.findByText('Stable Scaffold')

    listing.fail = true
    fireEvent.click(screen.getByRole('button', { name: zh['deployments.refresh'] }))
    const alert = await view.findByRole('alert')
    expect(alert.textContent).toContain(zh['deployments.templates.loadFailed'].replace('{message}', 'offline'))
    expect(screen.getByText('Stable Scaffold')).toBeTruthy()
  })

  it('drops a page read that resolves after the tab unmounted', async () => {
    let resolveList: ((page: unknown) => void) | undefined
    const list = vi.fn(() => new Promise((resolve) => { resolveList = resolve }))
    const clients = {
      deployClient: { template: { appTemplates: { list }, appTemplateVersions: { list: vi.fn() } } },
      driveClient: {},
    } as unknown as DeployHostClients
    const view = render(<DeployedTemplatesPanel clients={clients} t={t} />)
    view.unmount()
    await act(async () => {
      resolveList?.({
        items: [template({ displayName: 'Late Scaffold' })],
        pageInfo: { mode: 'offset', hasMore: false },
      })
      await Promise.resolve()
    })
    expect(document.body.textContent).not.toContain('Late Scaffold')
  })

  it('drops a version read that settles after the tab unmounted and aborts it', async () => {
    let settleVersion: (() => void) | undefined
    let versionSignal: AbortSignal | undefined
    const versionGate = new Promise<void>((resolve) => { settleVersion = resolve })
    const clients = {
      deployClient: {
        template: {
          appTemplates: {
            list: vi.fn(async () => ({
              items: [template({ displayName: 'Versioned Scaffold', latestVersionUuid: 'version-1' })],
              pageInfo: { mode: 'offset', hasMore: false },
            })),
          },
          appTemplateVersions: {
            list: vi.fn(async (
              _templateId: string,
              _params: unknown,
              options?: { signal?: AbortSignal },
            ) => {
              versionSignal = options?.signal
              await versionGate
              return { items: [{ id: 'version-1', templateVersion: '9.9.9' }] }
            }),
          },
        },
      },
      driveClient: {},
    } as unknown as DeployHostClients
    const view = render(<DeployedTemplatesPanel clients={clients} t={t} />)
    await screen.findByText('Versioned Scaffold')
    view.unmount()
    expect(versionSignal?.aborted).toBe(true)
    await act(async () => {
      settleVersion?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(document.body.textContent).not.toContain('9.9.9')
  })
})
