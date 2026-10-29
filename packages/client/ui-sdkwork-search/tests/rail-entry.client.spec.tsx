// @vitest-environment jsdom
/**
 * Search rail entry spec: the 44px cell renders the outline glyph while idle,
 * swaps to the filled glyph with the selection chrome while active, and
 * switches the frame mode on click.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { SearchRailEntry, type SearchRailEntryProps } from '../src/client/RailEntry.tsx'

const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Empty global standard-kit hooks (the entry reads none). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}

function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as SearchRailEntryProps['t']

/** The entry reads neither standard hook; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  ...allowAllAccess,
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

describe('SearchRailEntry', () => {
  it('renders the outline glyph while idle and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(
      <SearchRailEntry {...standard} mode="search" active={false} setMode={setMode} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.search.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    // Idle keeps the outline glyph: a stroked ring, no filled rule.
    expect(button.querySelector('circle[stroke]')).not.toBeNull()
    expect(button.querySelector('[fill-rule]')).toBeNull()
    expect(button.className).not.toContain('active')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('search')
  })

  it('renders the filled glyph with the selection chrome while active', () => {
    const { container } = render(
      <SearchRailEntry {...standard} mode="search" active={true} setMode={() => {}} t={t} />,
    )
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    // Active swaps to the solid ring (even-odd fill) on the selection cell.
    expect(button.querySelector('[fill-rule]')).not.toBeNull()
    expect(button.className).toContain('active')
  })
})
