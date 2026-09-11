// @vitest-environment jsdom
/** Image generation page mounts the SDKWork Agents creative (生成) surface. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ImageGenerationsPage, type ImageGenerationsPageProps } from '../src/client/GenerationsPage.tsx'

/** Signed-in gate stub: the page mount never opens the overlay in specs. */
const authGate = {
  isSignedIn: () => true,
  openSignInOverlay: () => {},
  subscribe: () => () => {},
}


vi.mock('../src/client/creativeHost.ts', () => ({
  CreativeApp: () => <div data-testid="sdkwork-creative-app" />,
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

function emptyPanelInfo() {
  return bindSnapshotSelector(createSnapshotStore<PanelInfo>({ activePanelId: null }))
}

const t = ((key: string) => key) as ImageGenerationsPageProps['t']
const standard = {
  authGate,
  useSessions: emptySessions(),
  useWorkspaces: emptyWorkspaces(),
  usePanelInfo: emptyPanelInfo(),
}

afterEach(cleanup)

describe('ImageGenerationsPage', () => {
  it('marks the image page and mounts the embedded SDKWork creative surface', () => {
    const { container, getByTestId } = render(
      <ImageGenerationsPage {...standard} mode="image" t={t} />,
    )
    const page = container.querySelector('[data-mode-page="image"]')!
    expect(page.getAttribute('data-mode')).toBe('image')
    expect(page.getAttribute('data-creative-surface')).toBe('sdkwork')
    expect(getByTestId('sdkwork-creative-app')).toBeTruthy()
  })

  it('stays browsable while signed out: no login wall, no implicit overlay', () => {
    // The requirement is deferred to the backend transport, so opening the
    // mode signed out shows the product instead of a notice.
    const signedOutGate = {
      isSignedIn: () => false,
      openSignInOverlay: vi.fn(),
      subscribe: () => () => {},
    }
    const { container, getByTestId } = render(
      <ImageGenerationsPage {...standard} authGate={signedOutGate} mode="image" t={t} />,
    )
    expect(container.querySelector('[data-auth-required="true"]')).toBeNull()
    expect(getByTestId('sdkwork-creative-app')).toBeTruthy()
    expect(signedOutGate.openSignInOverlay).not.toHaveBeenCalled()
  })
})
