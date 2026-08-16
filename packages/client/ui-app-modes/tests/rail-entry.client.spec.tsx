// @vitest-environment jsdom
/**
 * Base-five rail entry spec: the 44px cell renders the outline glyph while
 * idle, swaps to the filled glyph with the selection chrome while active,
 * and switches the frame mode on click. Each base mode is exercised so the
 * filled variants stay covered.
 */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { RailEntry, type RailEntryProps } from '../src/client/RailEntry.tsx'
import { BASE_MODES } from '../src/client/base-modes.ts'

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
const t = ((key: string) => key) as RailEntryProps['t']

/** The entry reads neither standard hook; supply empty kit. */
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('RailEntry', () => {
  it('renders the outline glyph while idle and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(
      <RailEntry {...standard} mode="video" active={false} setMode={setMode} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.video.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    // Idle keeps the outline glyph (stroke paths present, no selection class).
    expect(button.querySelector('[stroke]')).not.toBeNull()
    expect(button.className).not.toContain('active')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('video')
  })

  it('renders the filled glyph with the selection chrome while active for every base mode', () => {
    // Every base mode must exercise its filled variant: render the entry once
    // per mode and check the active cell swaps to the solid weight.
    for (const mode of BASE_MODES) {
      const { container } = render(
        <RailEntry {...standard} mode={mode} active={true} setMode={() => {}} t={t} />,
      )
      const button = container.querySelector('button')!
      expect(button.getAttribute('aria-pressed')).toBe('true')
      expect(button.querySelector('[stroke]')).toBeNull()
      expect(button.className).toContain('active')
      cleanup()
    }
  })
})
