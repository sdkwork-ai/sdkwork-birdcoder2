// @vitest-environment jsdom
/**
 * IM connector rail shortcut spec: the 44px cell renders the linked-bubble
 * glyph, switches the frame to the IM mode on click, and carries the selection
 * chrome and current-page semantics while that mode is active. The hover label
 * is the product name, "IM链接器".
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ImConnectorEntry, type ImConnectorEntryProps } from '../src/client/ImConnectorEntry.tsx'
import { ImModePage } from '../src/client/ImModePage.tsx'

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
const t = ((key: string) => key) as ImConnectorEntryProps['t']

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })

/** The rail's standard kit; the shortcut reads only the owner's active mode. */
const standard = {
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

/** Props for one shortcut render at a given active mode. */
function entryProps(activeMode: AppModeId, selectMode = vi.fn()) {
  return { ...standard, mode: 'im' as AppModeId, activeMode, selectMode, t }
}

describe('ImConnectorEntry', () => {
  it('renders the linked-bubble glyph and switches to the IM mode on click', () => {
    const selectMode = vi.fn()
    const { container } = render(<ImConnectorEntry {...entryProps('code', selectMode)} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('entry.aria')
    expect(button.getAttribute('aria-current')).toBeNull()
    expect(button.className).not.toContain('active')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(button.querySelectorAll('svg [stroke]').length).toBeGreaterThan(0)
    fireEvent.click(button)
    expect(selectMode).toHaveBeenCalledTimes(1)
  })

  it('marks the shortcut current while its own mode owns the frame', () => {
    const { container } = render(<ImConnectorEntry {...entryProps('im')} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-current')).toBe('page')
    expect(button.className).toContain('active')
  })

  it('labels the shortcut with the product copy on hover', () => {
    const { container, getByRole } = render(<ImConnectorEntry {...entryProps('code')} />)
    const button = container.querySelector('button')!
    act(() => { button.focus() })
    expect(getByRole('tooltip').textContent).toBe('entry.label')
    act(() => { button.blur() })
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
  })
})

describe('ImModePage', () => {
  it('renders the IM panel inside the full-surface page frame', () => {
    const { getByText, container } = render(
      <ImModePage {...standard} renderPanel={() => <span data-testid="im-panel">IM panel</span>} />,
    )
    expect(getByText('IM panel')).toBeTruthy()
    const page = container.querySelector('[data-im-connector-page]')!
    expect(page.contains(getByText('IM panel'))).toBe(true)
  })
})
