// @vitest-environment jsdom
/** Course rail entry spec: glyph swap and mode switch on click. */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { CourseRailEntry, type CourseRailEntryProps } from '../src/client/RailEntry.tsx'

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

const t = ((key: string) => key) as CourseRailEntryProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('CourseRailEntry', () => {
  it('renders the outline glyph while idle and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(
      <CourseRailEntry {...standard} mode="course" active={false} setMode={setMode} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.course.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.querySelector('[stroke]')).not.toBeNull()
    expect(button.className).not.toContain('active')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('course')
  })

  it('renders the filled glyph with the selection chrome while active', () => {
    const { container } = render(
      <CourseRailEntry {...standard} mode="course" active={true} setMode={() => {}} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('[stroke]')).toBeNull()
    expect(button.className).toContain('active')
  })
})
