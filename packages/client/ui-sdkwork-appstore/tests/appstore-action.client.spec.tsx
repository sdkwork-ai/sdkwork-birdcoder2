// @vitest-environment jsdom
/**
 * App Store sidebar entry spec: the wide row renders the grid glyph with its
 * label, the collapsed rail renders the icon control only, and a click
 * switches the frame to the appstore mode.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SidebarAction, type SidebarActionProps } from '../src/client/SidebarAction.tsx'

/** Signed-in gate stub: the entry opens no sign-in surface. */
const authGate = {
  isSignedIn: () => true,
  openSignInOverlay: () => {},
  subscribe: () => () => {},
}

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

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as SidebarActionProps['t']

/** The entry reads none of the standard hooks; supply empty kit and the owner share. */
const standard = {
  startSession: () => {},
  authGate, useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
}

describe('SidebarAction', () => {
  it('renders the labeled wide row and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(
      <SidebarAction {...standard} setMode={setMode} wide={true} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.appstore.label')
    expect(button.textContent).toContain('mode.appstore')
    expect(button.querySelector('svg')).not.toBeNull()
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })

  it('renders the icon-only rail control when the sidebar is collapsed', () => {
    const setMode = vi.fn()
    const { container } = render(
      <SidebarAction {...standard} setMode={setMode} wide={false} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.appstore.label')
    expect(button.textContent).not.toContain('mode.appstore')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledTimes(1)
  })
})
