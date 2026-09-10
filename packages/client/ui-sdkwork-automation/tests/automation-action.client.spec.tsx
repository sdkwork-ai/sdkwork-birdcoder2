// @vitest-environment jsdom
/**
 * Automation action spec: the sidebar quick entry renders the wide icon+label
 * row and forwards clicks to the injected setMode callback.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { AutomationAction, type AutomationActionProps } from '../src/client/AutomationAction.tsx'

afterEach(() => { cleanup() })

/** Empty global standard-kit hooks (the action reads none). */
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

/** Empty pending-interaction source (the action reads none). */
function noPendingInteraction() {
  return bindSnapshotSelector(createSnapshotStore(new Map<never, never>()))
}

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as AutomationActionProps['t']

/** The action reads none of the standard hooks; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
  usePanelInfo, useResource,
}

describe('AutomationAction', () => {
  it('renders the wide row and switches modes on click', () => {
    const setMode = vi.fn()
    const view = render(<AutomationAction {...standard} setMode={setMode} startSession={vi.fn()} wide t={t} />)
    const button = view.getByRole('button', { name: 'mode.automation.label' })
    expect(button.textContent).toContain('mode.automation')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })

  it('renders the collapsed rail icon without the label', () => {
    const setMode = vi.fn()
    const view = render(<AutomationAction {...standard} setMode={setMode} startSession={vi.fn()} wide={false} t={t} />)
    const button = view.getByRole('button', { name: 'mode.automation.label' })
    expect(button.textContent).not.toContain('mode.automation')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })
})
