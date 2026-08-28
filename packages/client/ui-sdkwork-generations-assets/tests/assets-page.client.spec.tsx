// @vitest-environment jsdom
/** Assets page mounts the SDKWork Agents assets (资产) surface. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { AssetsPage, type AssetsPageProps } from '../src/client/AssetsPage.tsx'

/** Signed-in gate stub: the page mount never opens the overlay in specs. */
const authGate = {
  isSignedIn: () => true,
  openSignInOverlay: () => {},
  subscribe: () => () => {},
}


vi.mock('../src/client/assetsHost.ts', () => ({
  AssetsApp: () => <div data-testid="sdkwork-assets-app" />,
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

const t = ((key: string) => key) as AssetsPageProps['t']
const standard = {
  authGate, useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

afterEach(cleanup)

describe('AssetsPage', () => {
  it('marks the assets page and mounts the embedded SDKWork assets surface', () => {
    const { container, getByTestId } = render(
      <AssetsPage {...standard} mode="assets" t={t} />,
    )
    const page = container.querySelector('[data-mode-page="assets"]')!
    expect(page.getAttribute('data-mode')).toBe('assets')
    expect(page.getAttribute('data-assets-surface')).toBe('sdkwork')
    expect(getByTestId('sdkwork-assets-app')).toBeTruthy()
  })
})