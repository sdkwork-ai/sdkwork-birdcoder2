// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore, type SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TokenPlanRailEntry, type TokenPlanRailEntryProps } from '../src/client/RailEntry.tsx'

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', currentAddress: undefined,
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }))
}

const t = ((key: string) => key) as TokenPlanRailEntryProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('TokenPlanRailEntry', () => {
  it('switches to Token Plan with an accessible mode button', () => {
    const setMode = vi.fn()
    const { getByRole } = render(
      <TokenPlanRailEntry {...standard} mode="token-plan" active={false} setMode={setMode} t={t} />,
    )
    const button = getByRole('button', { name: 'mode.tokenPlan.label' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('token-plan')
  })

  it('renders the active glyph and selection state', () => {
    const { container } = render(
      <TokenPlanRailEntry {...standard} mode="token-plan" active={true} setMode={() => {}} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.className).toContain('active')
  })
})
