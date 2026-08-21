// @vitest-environment jsdom
/** Course page spec: mounts the SDKWork course surface in the mode page seat. */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { CoursePage, type CoursePageProps } from '../src/client/CoursePage.tsx'

vi.mock('../src/client/courseHost.ts', () => ({
  CourseApp: () => <div data-testid="course-app">Course surface</div>,
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

const t = ((key: string) => key) as CoursePageProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }
const authGate = {
  isSignedIn: () => true,
  openSignInOverlay: () => {},
  subscribe: () => () => {},
}

describe('CoursePage', () => {
  it('renders the course surface with its mode id', () => {
    const { container, getByTestId } = render(
      <CoursePage {...standard} mode="course" authGate={authGate} t={t} />,
    )
    const page = container.querySelector('[data-mode="course"]')!
    expect(page.getAttribute('data-mode-page')).toBe('course')
    expect(getByTestId('course-app')).toBeTruthy()
  })
})
