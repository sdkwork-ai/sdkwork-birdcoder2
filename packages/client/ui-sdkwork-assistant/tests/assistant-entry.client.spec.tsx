// @vitest-environment jsdom
/**
 * Assistant rail cell spec: the 44px cell below Home renders the robot glyph,
 * opens the linked layer's main panel on click, paints its selection from the
 * panel selection (the frame's mode never changes for this cell), and labels
 * itself 助理 / Assistant.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { AssistantRailEntry, type AssistantRailEntryProps } from '../src/client/AssistantRailEntry.tsx'

const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Empty global standard-kit hooks (the cell reads only the panel selection). */
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
const t = ((key: string) => key) as AssistantRailEntryProps['t']

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']

/** The rail's standard kit; the cell reads only the panel selection. */
const standard = {
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  useResource,
}

/** Props for one cell render with an explicit panel selection. */
function cellProps(activePanelId: MainPanelId | null, open = vi.fn()) {
  const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId })
  return { ...standard, active: false, setMode: vi.fn(), open, usePanelInfo, t }
}

describe('AssistantRailEntry', () => {
  it('renders the robot glyph and opens the assistant panel on click', () => {
    const open = vi.fn()
    const { container } = render(<AssistantRailEntry {...cellProps(null, open)} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('entry.aria')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.className).not.toContain('active')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(button.querySelector('svg')?.getAttribute('data-variant')).toBe('outline')
    expect(button.querySelectorAll('svg [stroke]').length).toBeGreaterThan(0)
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('paints the selection from the main-panel selection, not from the frame mode', () => {
    const { container } = render(<AssistantRailEntry {...cellProps('botharness' as MainPanelId)} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.className).toContain('active')
    // The rail's other cells swap to their filled glyph when selected; the
    // assistant must not stay a stroked outline while active.
    const svg = button.querySelector('svg')
    expect(svg?.getAttribute('data-variant')).toBe('filled')
    expect(svg?.querySelectorAll('[stroke]')).toHaveLength(0)
    expect(svg?.querySelector('[fill-rule="evenodd"]')).not.toBeNull()
  })

  it('labels the cell with the assistant copy on hover', () => {
    const { container, getByRole } = render(<AssistantRailEntry {...cellProps(null)} />)
    const button = container.querySelector('button')!
    act(() => { button.focus() })
    expect(getByRole('tooltip').textContent).toBe('entry.label')
    act(() => { button.blur() })
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
  })
})
