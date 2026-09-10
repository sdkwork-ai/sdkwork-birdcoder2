// @vitest-environment jsdom
/**
 * Pull Request sidebar entry spec: the wide row renders the branch glyph with
 * its label, the collapsed rail renders the icon control only, and a click
 * switches the frame to the pull-request mode.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { PullRequestAction, type PullRequestActionProps } from '../src/client/PullRequestAction.tsx'

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
const t = ((key: string) => key) as PullRequestActionProps['t']

/** The entry reads none of the standard hooks; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  startSession: () => {},
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
  usePanelInfo, useResource,
}

describe('PullRequestAction', () => {
  it('renders the labeled wide row and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(
      <PullRequestAction {...standard} setMode={setMode} wide={true} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.pullRequest.label')
    expect(button.textContent).toContain('mode.pullRequest')
    expect(button.querySelector('svg')).not.toBeNull()
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })

  it('renders the icon-only rail control when the sidebar is collapsed', () => {
    const setMode = vi.fn()
    const { container } = render(
      <PullRequestAction {...standard} setMode={setMode} wide={false} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.pullRequest.label')
    expect(button.textContent).not.toContain('mode.pullRequest')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })
})
