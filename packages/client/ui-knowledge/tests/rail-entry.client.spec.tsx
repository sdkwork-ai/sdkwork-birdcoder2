// @vitest-environment jsdom
/**
 * Knowledge rail entry spec: the 44px cell renders the outline glyph while
 * idle, swaps to the filled glyph with the selection chrome while active,
 * and switches the frame mode on click.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { KnowledgeRailEntry, type KnowledgeRailEntryProps } from '../src/client/RailEntry.tsx'

/** Empty global standard-kit hooks (the entry reads neither). */
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
const t = ((key: string) => key) as KnowledgeRailEntryProps['t']

/** The entry reads neither standard hook; supply empty kit. */
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('KnowledgeRailEntry', () => {
  it('renders the outline glyph while idle and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(
      <KnowledgeRailEntry {...standard} mode="knowledge" active={false} setMode={setMode} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.knowledge.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    // Idle keeps the outline glyph (stroke paths present, no selection class).
    expect(button.querySelector('[stroke]')).not.toBeNull()
    expect(button.className).not.toContain('active')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('knowledge')
  })

  it('renders the filled glyph with the selection chrome while active', () => {
    const { container } = render(
      <KnowledgeRailEntry {...standard} mode="knowledge" active={true} setMode={() => {}} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    // Active swaps to the solid glyph (no stroke anywhere) on the selection cell.
    expect(button.querySelector('[stroke]')).toBeNull()
    expect(button.className).toContain('active')
  })
})
