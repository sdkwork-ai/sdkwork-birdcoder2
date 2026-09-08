// @vitest-environment jsdom
/**
 * New Chat sidebar entry spec: the wide row renders the compose glyph with
 * its label, the collapsed rail renders the icon control only, and a click
 * starts a Session through the shell's shared New Session action.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { NewChatAction, type NewChatActionProps } from '../src/client/NewChatAction.tsx'

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
const t = ((key: string) => key) as NewChatActionProps['t']

/** The entry reads none of the standard hooks; supply empty kit. */
const standard = {
  startSession: () => {},
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
}

describe('NewChatAction', () => {
  it('renders the labeled wide row and starts a Session on click', () => {
    const startSession = vi.fn()
    const { container } = render(
      <NewChatAction {...standard} startSession={startSession} wide={true} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('action.newChat.label')
    expect(button.textContent).toContain('action.newChat')
    expect(button.querySelector('svg')).not.toBeNull()
    fireEvent.click(button)
    expect(startSession).toHaveBeenCalledTimes(1)
  })

  it('renders the icon-only rail control when the sidebar is collapsed', () => {
    const startSession = vi.fn()
    const { container } = render(
      <NewChatAction {...standard} startSession={startSession} wide={false} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('action.newChat.label')
    expect(button.textContent).not.toContain('action.newChat')
    fireEvent.click(button)
    expect(startSession).toHaveBeenCalledTimes(1)
  })
})
