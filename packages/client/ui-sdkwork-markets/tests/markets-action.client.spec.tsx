// @vitest-environment jsdom
/**
 * Markets action spec: the sidebar quick entry renders the wide icon+label
 * row and forwards clicks to the injected setMode callback.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MarketsAction, type MarketsActionProps } from '../src/client/MarketsAction.tsx'

afterEach(() => { cleanup() })

/** Empty global standard-kit hooks (the entry reads none). */
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

/** Empty pending-interaction source (the entry reads none). */
function noPendingInteraction() {
  return bindSnapshotSelector(createSnapshotStore(new Map<never, never>()))
}

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as MarketsActionProps['t']

/** The entry reads none of the standard hooks; supply empty kit. */
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
}

describe('MarketsAction', () => {
  it('renders the wide row and switches modes on click', () => {
    const setMode = vi.fn()
    const view = render(<MarketsAction {...standard} setMode={setMode} startSession={vi.fn()} wide t={t} />)
    const button = view.getByRole('button', { name: 'mode.markets.label' })
    expect(button.textContent).toContain('mode.markets')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })

  it('renders the collapsed rail icon without the label', () => {
    const setMode = vi.fn()
    const view = render(<MarketsAction {...standard} setMode={setMode} startSession={vi.fn()} wide={false} t={t} />)
    const button = view.getByRole('button', { name: 'mode.markets.label' })
    expect(button.textContent).not.toContain('mode.markets')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })
})
