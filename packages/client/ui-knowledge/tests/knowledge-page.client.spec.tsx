// @vitest-environment jsdom
/** Knowledge page spec: mounts the SDKWork knowledgebase surface in the mode page seat. */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { KnowledgePage, type KnowledgePageProps } from '../src/client/KnowledgePage.tsx'

vi.mock('../src/client/knowledgebaseHost.ts', () => ({
  KnowledgebaseApp: () => <div data-testid="knowledgebase-app">Knowledge surface</div>,
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
const t = ((key: string) => key) as KnowledgePageProps['t']

/** The page reads neither standard hook; supply empty kit. */
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('KnowledgePage', () => {
  it('renders the knowledgebase surface with its mode id', () => {
    const { container, getByTestId } = render(<KnowledgePage {...standard} mode="knowledge" t={t} />)
    const page = container.querySelector('[data-mode="knowledge"]')!
    expect(page.getAttribute('data-mode-page')).toBe('knowledge')
    expect(getByTestId('knowledgebase-app')).toBeTruthy()
  })
})
