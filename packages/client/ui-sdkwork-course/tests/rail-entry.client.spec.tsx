// @vitest-environment jsdom
/** Course rail entry spec: glyph swap and mode switch on click. */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { CourseRailEntry, type CourseRailEntryProps } from '../src/client/RailEntry.tsx'

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', currentAddress: undefined })
  return bindSnapshotSelector(store)
}

function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
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

  it('keeps one 24px optical box across the weight swap', () => {
    const idle = render(<CourseRailEntry {...standard} mode="course" active={false} setMode={() => {}} t={t} />)
    const active = render(<CourseRailEntry {...standard} mode="course" active={true} setMode={() => {}} t={t} />)
    const read = (button: Element) => {
      const svg = button.querySelector('svg')!
      return {
        viewBox: svg.getAttribute('viewBox'),
        width: svg.getAttribute('width'),
        height: svg.getAttribute('height'),
        decorative: svg.getAttribute('aria-hidden'),
        stroked: svg.querySelectorAll('[stroke]').length,
        paths: [...svg.querySelectorAll('path')].map(path => path.getAttribute('d')),
      }
    }
    const outline = read(idle.container.querySelector('button')!)
    const filled = read(active.container.querySelector('button')!)

    // Selection replaces the weight, never the box: same grid, size and centering.
    expect(outline.viewBox).toBe('0 0 24 24')
    expect(filled.viewBox).toBe(outline.viewBox)
    expect(outline.width).toBe('24')
    expect(filled.width).toBe(outline.width)
    expect(filled.height).toBe(outline.height)
    // The icon-only button owns the accessible name, so both weights stay decorative.
    expect(outline.decorative).toBe('true')
    expect(filled.decorative).toBe('true')
    // Stroke-only when idle, fill-only when active: no single-path pair can impersonate one another.
    expect(outline.stroked).toBeGreaterThan(0)
    expect(filled.stroked).toBe(0)
    expect(filled.paths.length).toBeGreaterThan(0)
    // A filled asset that repeats the outline geometry draws the same glyph.
    expect(filled.paths).not.toEqual(outline.paths)
  })
})
