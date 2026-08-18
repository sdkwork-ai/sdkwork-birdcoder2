// @vitest-environment jsdom
/** Generated-assets page: idle triggers one load, filters and date groups shape the library, and the detail panel shows one asset. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { AssetsPage, kindOf, type AssetsPageProps } from '../src/client/AssetsPage.tsx'
import type { AssetsSnapshot } from '../src/client/assets-service.ts'

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

const t = ((key: string) => key) as AssetsPageProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }
function observable(snapshot: AssetsSnapshot) {
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}
const idle = (): AssetsSnapshot => ({ status: 'idle', items: [] })

afterEach(cleanup)

describe('AssetsPage', () => {
  it('marks the assets page and loads once when idle', async () => {
    const load = vi.fn(() => {})
    const { container } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={load}
        useAssets={bindSnapshotSelector(observable(idle()))}
        t={t}
      />,
    )
    const page = container.querySelector('[data-mode-page="assets"]')!
    expect(page.getAttribute('data-mode')).toBe('assets')
    expect(within(page).getByRole('heading', { name: 'page.title' })).toBeTruthy()
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(1) })
  })

  it('shows the configuration state without filters or requests', () => {
    const load = vi.fn()
    const { getByRole, queryByRole } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={load}
        useAssets={bindSnapshotSelector(observable({ status: 'unconfigured', items: [] }))}
        t={t}
      />,
    )
    expect(getByRole('status').textContent).toContain('page.configure')
    expect(queryByRole('group', { name: 'page.title' })).toBeNull()
  })

  it('shows the loading state', () => {
    const { getByRole } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={vi.fn()}
        useAssets={bindSnapshotSelector(observable({ status: 'loading', items: [] }))}
        t={t}
      />,
    )
    expect(getByRole('status').textContent).toContain('page.loading')
  })

  it('shows the error state and retries the load', () => {
    const load = vi.fn()
    const { getByRole } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={load}
        useAssets={bindSnapshotSelector(observable({ status: 'error', items: [] }))}
        t={t}
      />,
    )
    expect(getByRole('alert').textContent).toContain('page.error')
    fireEvent.click(getByRole('button', { name: 'page.retry' }))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('renders the empty notice for a ready list without assets', () => {
    const { getByRole } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={vi.fn()}
        useAssets={bindSnapshotSelector(observable({ status: 'ready', items: [] }))}
        t={t}
      />,
    )
    expect(getByRole('status').textContent).toContain('page.empty')
  })

  it('groups assets by date and filters by kind', () => {
    const snapshot: AssetsSnapshot = {
      status: 'ready',
      items: [
        {
          toolId: 'image.generations.create', toolCallId: 'call-1', mediaKind: 'image',
          driveUri: 'drive://spaces/s1/nodes/n1', sourceUrl: 'https://assets.sdkwork.com/a.png', createdAt: '2026-08-18T01:00:00Z',
        },
        {
          toolId: 'video.create', toolCallId: 'call-2', mediaKind: 'video',
          driveUri: 'drive://spaces/s1/nodes/n2', sourceUrl: 'https://assets.sdkwork.com/b.mp4', createdAt: '2026-08-18T02:00:00Z',
        },
        {
          toolId: 'audio.speech.create', toolCallId: 'call-3', mediaKind: 'audio',
          driveUri: 'drive://spaces/s1/nodes/n3', sourceUrl: 'https://assets.sdkwork.com/c.mp3', createdAt: '2026-08-17T09:00:00Z',
        },
        {
          toolId: 'video.create', toolCallId: 'call-4', mediaKind: 'video',
          driveUri: 'drive://spaces/s1/nodes/n4',
        },
        {
          toolId: 'image.generations.create', toolCallId: 'call-5', mediaKind: 'document',
          driveUri: 'drive://spaces/s1/nodes/n5', sourceUrl: 'https://assets.sdkwork.com/d.pdf', createdAt: '2026-08-18T03:00:00Z',
        },
      ],
    }
    const { getByRole, getAllByRole, container } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={vi.fn()}
        useAssets={bindSnapshotSelector(observable(snapshot))}
        t={t}
      />,
    )
    // Three date groups: the 18th, the 17th, and the unknown bucket.
    expect(container.querySelectorAll('section')).toHaveLength(3)
    expect(container.querySelectorAll('h2')).toHaveLength(3)
    // Five cards render media previews by kind: the image and video with a
    // source URL, the audio player, and the document badge for the
    // other-kind preview; the sourceless card shows its own kind badge.
    expect(getAllByRole('button', { name: 'page.item' })).toHaveLength(5)
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelectorAll('video')).toHaveLength(1)
    expect(container.querySelectorAll('audio')).toHaveLength(1)
    expect(container.querySelectorAll('span')).not.toHaveLength(0)
    expect(container.textContent).toContain('document')
    // Filtering to images keeps one card and drops the audio group.
    fireEvent.click(getByRole('button', { name: 'page.filter.image' }))
    expect(getByRole('button', { name: 'page.filter.image' }).getAttribute('aria-pressed')).toBe('true')
    expect(getAllByRole('button', { name: 'page.item' })).toHaveLength(1)
    expect(container.querySelectorAll('section')).toHaveLength(1)
  })

  it('opens and closes the detail panel for a selected asset', () => {
    const item = {
      toolId: 'image.generations.create', toolCallId: 'call-1', mediaKind: 'image',
      driveUri: 'drive://spaces/s1/nodes/n1', sourceUrl: 'https://assets.sdkwork.com/a.png', createdAt: '2026-08-18T01:00:00Z',
    }
    const { getByRole, queryByRole } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={vi.fn()}
        useAssets={bindSnapshotSelector(observable({ status: 'ready', items: [item] }))}
        t={t}
      />,
    )
    fireEvent.click(getByRole('button', { name: 'page.item' }))
    const dialog = getByRole('dialog', { name: 'page.detail' })
    expect(within(dialog).getByText('image.generations.create')).toBeTruthy()
    expect(within(dialog).getByText('drive://spaces/s1/nodes/n1')).toBeTruthy()
    expect(within(dialog).getByText('2026-08-18')).toBeTruthy()
    expect(dialog.querySelector('img')!.getAttribute('src')).toBe('https://assets.sdkwork.com/a.png')
    fireEvent.click(getByRole('button', { name: 'page.detail.close' }))
    expect(queryByRole('dialog')).toBeNull()
  })

  it('shows the unknown-date group for assets without a creation time', () => {
    const { container, getByText } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={vi.fn()}
        useAssets={bindSnapshotSelector(observable({
          status: 'ready',
          items: [{ toolId: 'video.create', toolCallId: 'call-1', mediaKind: 'video', driveUri: 'drive://spaces/s1/nodes/n1' }],
        }))}
        t={t}
      />,
    )
    expect(getByText('page.group.unknown')).toBeTruthy()
    expect(container.querySelectorAll('section')).toHaveLength(1)
  })

  it('shows the unknown date in the detail panel for an asset without a creation time', () => {
    const item = {
      toolId: 'video.create', toolCallId: 'call-1', mediaKind: 'video',
      driveUri: 'drive://spaces/s1/nodes/n1', sourceUrl: 'https://assets.sdkwork.com/b.mp4',
    }
    const { getByRole } = render(
      <AssetsPage
        {...standard}
        mode="assets"
        load={vi.fn()}
        useAssets={bindSnapshotSelector(observable({ status: 'ready', items: [item] }))}
        t={t}
      />,
    )
    fireEvent.click(getByRole('button', { name: 'page.item' }))
    const dialog = getByRole('dialog', { name: 'page.detail' })
    expect(within(dialog).getByText('page.group.unknown')).toBeTruthy()
    expect(dialog.querySelector('video')!.getAttribute('src'))
      .toBe('https://assets.sdkwork.com/b.mp4')
  })

  it('maps media kinds onto the filter categories', () => {
    expect(kindOf('image')).toBe('image')
    expect(kindOf('video')).toBe('video')
    expect(kindOf('music')).toBe('audio')
    expect(kindOf('sound-effect')).toBe('audio')
    expect(kindOf('voice')).toBe('audio')
    expect(kindOf('document')).toBe('other')
    expect(kindOf('mystery')).toBe('other')
  })
})
