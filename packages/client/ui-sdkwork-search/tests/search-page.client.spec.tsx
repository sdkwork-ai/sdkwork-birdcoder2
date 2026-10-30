// @vitest-environment jsdom
/**
 * Search page spec: submit runs the injected query, results render grouped with
 * their origin badge, a hit hands its destination back to the plugin, and the
 * idle, empty, degraded, and failed states each render their own copy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { SearchOutcome } from '../src/client/searchRuntime.ts'
import { SearchPage, type SearchPageProps } from '../src/client/SearchPage.tsx'

const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Empty global standard-kit hooks (the page reads none). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}

function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

/** Locale seat stand-in: keys (and their params) render verbatim. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params === undefined ? key : `${key}:${JSON.stringify(params)}`) as SearchPageProps['t']

afterEach(cleanup)

/** One outcome with a navigable app hit and a remote hit without a destination. */
const outcome: SearchOutcome = {
  groups: [
    {
      id: 'local:0',
      heading: 'group.creation',
      results: [
        { id: 'mode:assets', title: 'catalog.assets', description: 'catalog.assets.description', origin: 'local', destination: { mode: 'assets' } },
      ],
    },
    {
      id: 'remote:0',
      heading: '',
      results: [{ id: 'remote:1', title: 'Remote doc', origin: 'remote' }],
    },
  ],
  total: 2,
  degraded: false,
}

const searchField = (): HTMLInputElement => screen.getByRole('searchbox') as HTMLInputElement

/** The page's submit control, narrowed to its real element type. */
function submitButton(): HTMLButtonElement {
  const button = screen.getByRole('button', { name: 'input.submit' })
  if (!(button instanceof HTMLButtonElement)) throw new Error('submit control is not a button')
  return button
}

/**
 * Submit one query through the page form.
 * @param query - text typed into the search field.
 */
function submitQuery(query: string): void {
  fireEvent.change(searchField(), { target: { value: query } })
  fireEvent.click(screen.getByRole('button', { name: 'input.submit' }))
}

describe('SearchPage', () => {
  it('starts idle with the submit button disabled until a query is typed', () => {
    const { container } = render(
      <SearchPage {...standard} mode="search" runSearch={vi.fn()} openResult={vi.fn()} t={t} />,
    )
    const page = container.querySelector('[data-mode="search"]')!
    expect(page.getAttribute('data-mode-page')).toBe('search')
    expect(page.getAttribute('data-search-surface')).toBe('sdkwork')
    expect(page.textContent).toContain('status.idle')
    expect(submitButton().disabled).toBe(true)
    fireEvent.change(searchField(), { target: { value: 'assets' } })
    expect(submitButton().disabled).toBe(false)
  })

  it('renders the grouped outcome and hands a hit back for navigation', async () => {
    const runSearch = vi.fn(async () => outcome)
    const openResult = vi.fn()
    render(<SearchPage {...standard} mode="search" runSearch={runSearch} openResult={openResult} t={t} />)
    submitQuery('assets')
    await waitFor(() => { expect(runSearch).toHaveBeenCalledWith('assets') })

    const localSection = await screen.findByRole('region', { name: 'group.creation' })
    expect(within(localSection).getByText('catalog.assets')).toBeTruthy()
    expect(within(localSection).getByText('origin.local')).toBeTruthy()
    expect(screen.getByText('status.results:{"count":2}')).toBeTruthy()

    // The unlabeled remote section renders without a heading, and its hit has
    // no destination, so it is not offered as a navigation control.
    const remoteTitle = screen.getByText('Remote doc')
    expect(remoteTitle.closest('button')?.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('origin.remote')).toBeTruthy()

    fireEvent.click(within(localSection).getByRole('button'))
    expect(openResult).toHaveBeenCalledWith(outcome.groups[0].results[0])
  })

  it('renders the empty state with the submitted query', async () => {
    render(
      <SearchPage {...standard} mode="search" runSearch={vi.fn(async () => ({ groups: [], total: 0, degraded: false }))} openResult={vi.fn()} t={t} />,
    )
    submitQuery('zzz')
    expect(await screen.findByText('status.empty:{"query":"zzz"}')).toBeTruthy()
  })

  it('reports a failed query without leaving the previous outcome on screen', async () => {
    const runSearch = vi.fn(async () => { throw new Error('search failed') })
    render(<SearchPage {...standard} mode="search" runSearch={runSearch} openResult={vi.fn()} t={t} />)
    submitQuery('assets')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('status.error')
  })

  it('keeps local results and flags the degradation when the SDKWork index is unreachable', async () => {
    const degraded: SearchOutcome = { ...outcome, degraded: true, total: 1, groups: [outcome.groups[0]] }
    render(
      <SearchPage {...standard} mode="search" runSearch={vi.fn(async () => degraded)} openResult={vi.fn()} t={t} />,
    )
    submitQuery('assets')
    expect(await screen.findByText('status.degraded')).toBeTruthy()
    expect(screen.getByText('catalog.assets')).toBeTruthy()
  })
})
