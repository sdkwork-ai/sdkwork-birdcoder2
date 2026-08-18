// @vitest-environment jsdom
/** Drive page spec: mounts the SDKWork drive surface in the mode page seat. */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { DrivePage, type DrivePageProps } from '../src/client/DrivePage.tsx'

vi.mock('../src/client/driveHost.ts', () => ({
  DriveApp: () => <div data-testid="drive-app">Drive surface</div>,
}))

/** Empty global standard-kit hooks (the page reads neither). */
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

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as DrivePageProps['t']

/** The page reads neither standard hook; supply empty kit. */
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('DrivePage', () => {
  it('renders the drive surface with its mode id', () => {
    const { container, getByTestId } = render(<DrivePage {...standard} mode="drive" t={t} />)
    const page = container.querySelector('[data-mode="drive"]')!
    expect(page.getAttribute('data-mode-page')).toBe('drive')
    expect(getByTestId('drive-app')).toBeTruthy()
  })
})
