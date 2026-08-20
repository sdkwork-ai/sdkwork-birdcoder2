// @vitest-environment jsdom
/** Image generation rail entry: visual state follows active mode and clicks select the keyed mode. */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ImageGenerationsRailEntry, type ImageGenerationsRailEntryProps } from '../src/client/RailEntry.tsx'

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

const t = ((key: string) => key) as ImageGenerationsRailEntryProps['t']
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

describe('ImageGenerationsRailEntry', () => {
  it('renders the outline glyph and selects image when clicked', () => {
    const setMode = vi.fn()
    const { container } = render(
      <ImageGenerationsRailEntry {...standard} mode="image" active={false} setMode={setMode} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.image.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.querySelector('[stroke]')).not.toBeNull()
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('image')
  })

  it('renders the filled glyph and active state when selected', () => {
    const { container } = render(
      <ImageGenerationsRailEntry {...standard} mode="image" active={true} setMode={() => {}} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('[stroke]')).toBeNull()
    expect(button.className).toContain('active')
  })
})
