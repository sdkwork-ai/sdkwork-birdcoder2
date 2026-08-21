// @vitest-environment jsdom
/** App Store page spec: mounts the SDKWork App Store surface in the mode page seat. */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { AppStorePage, type AppStorePageProps } from '../src/client/AppStorePage.tsx'

vi.mock('../src/client/appstoreHost.ts', () => ({
  AppstoreApp: () => <div data-testid="appstore-app">App Store surface</div>,
}))

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}

function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

const t = ((key: string) => key) as AppStorePageProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('AppStorePage', () => {
  it('renders the App Store surface with its mode id', () => {
    const { container, getByTestId } = render(<AppStorePage {...standard} mode="appstore" t={t} />)
    const page = container.querySelector('[data-mode="appstore"]')!
    expect(page.getAttribute('data-mode-page')).toBe('appstore')
    expect(page.getAttribute('data-appstore-surface')).toBe('sdkwork')
    expect(getByTestId('appstore-app')).toBeTruthy()
  })
})
