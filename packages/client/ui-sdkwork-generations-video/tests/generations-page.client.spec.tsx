// @vitest-environment jsdom
/** Video generation page mounts the SDKWork Agents creative (生成) surface. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { VideoGenerationsPage, type VideoGenerationsPageProps } from '../src/client/GenerationsPage.tsx'

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
  return bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }))
}

function emptyPanelInfo() {
  return bindSnapshotSelector(createSnapshotStore<PanelInfo>({ activePanelId: null }))
}

const t = ((key: string) => key) as VideoGenerationsPageProps['t']
const standard = {
  authGate,
  useSessions: emptySessions(),
  useWorkspaces: emptyWorkspaces(),
  usePanelInfo: emptyPanelInfo(),
}

afterEach(cleanup)

describe('VideoGenerationsPage', () => {
  it('marks the video page and mounts the embedded SDKWork creative surface', () => {
    const { container, getByTestId } = render(
      <VideoGenerationsPage {...standard} mode="video" t={t} />,
    )
    const page = container.querySelector('[data-mode-page="video"]')!
    expect(page.getAttribute('data-mode')).toBe('video')
    expect(page.getAttribute('data-creative-surface')).toBe('sdkwork')
    expect(getByTestId('sdkwork-creative-app')).toBeTruthy()
  })

  it('replaces the surface with the sign-in notice while signed out', () => {
    // Video generation needs a session for the work it creates, so the
    // embedded surface never mounts anonymously: the notice states the
    // requirement and only its own button opens the overlay.
    const signedOutGate = {
      isSignedIn: () => false,
      openSignInOverlay: vi.fn(),
      subscribe: () => () => {},
    }
    const { container, queryByTestId, getByRole } = render(
      <VideoGenerationsPage {...standard} authGate={signedOutGate} mode="video" t={t} />,
    )
    expect(container.querySelector('[data-auth-required="true"]')).not.toBeNull()
    expect(queryByTestId('sdkwork-creative-app')).toBeNull()
    expect(signedOutGate.openSignInOverlay).not.toHaveBeenCalled()
    fireEvent.click(getByRole('button', { name: 'auth.required.action' }))
    expect(signedOutGate.openSignInOverlay).toHaveBeenCalledTimes(1)
  })
})
