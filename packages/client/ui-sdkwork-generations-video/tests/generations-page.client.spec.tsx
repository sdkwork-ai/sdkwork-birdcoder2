// @vitest-environment jsdom
/** Video generation page mounts the SDKWork Agents creative (生成) surface. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { VideoGenerationsPage, type VideoGenerationsPageProps } from '../src/client/GenerationsPage.tsx'

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

const t = ((key: string) => key) as VideoGenerationsPageProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

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
})
