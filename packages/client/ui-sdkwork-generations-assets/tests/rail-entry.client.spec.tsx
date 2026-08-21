// @vitest-environment jsdom
/** Generated-assets rail entry: outline while idle, filled glyph while active, click selects the keyed mode. */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { AssetsGenerationsRailEntry, type AssetsGenerationsRailEntryProps } from '../src/client/RailEntry.tsx'

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

const t = ((key: string) => key) as AssetsGenerationsRailEntryProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('AssetsGenerationsRailEntry', () => {
  it('renders the outline glyph while idle and selects assets when clicked', () => {
    const setMode = vi.fn()
    const { container } = render(
      <AssetsGenerationsRailEntry {...standard} mode="assets" active={false} setMode={setMode} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.assets.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.querySelector('[stroke]')).not.toBeNull()
    expect(button.className).not.toContain('active')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('assets')
  })

  it('renders the filled glyph with the selection chrome while active', () => {
    const { container } = render(
      <AssetsGenerationsRailEntry {...standard} mode="assets" active={true} setMode={() => {}} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('[stroke]')).toBeNull()
    expect(button.className).toContain('active')
  })
})
