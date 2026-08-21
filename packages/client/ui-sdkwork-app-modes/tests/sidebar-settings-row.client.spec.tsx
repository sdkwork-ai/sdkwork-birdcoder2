// @vitest-environment jsdom
/**
 * Sidebar settings row spec: renders nothing until the scope accepts a
 * section, mirrors the mirrored store, and routes the switch write through
 * the injected face.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SidebarSettingsRow, type SidebarSettingsRowProps } from '../src/client/SidebarSettingsRow.tsx'
import { createSidebarSettingsRowStore } from '../src/client/sidebar-settings-store.ts'

/** Empty global standard-kit hooks (the row reads neither). */
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
const t = ((key: string) => key) as SidebarSettingsRowProps['t']

function mount(state: { visible: boolean | undefined; writable: boolean }) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createSidebarSettingsRowStore().create()
  store.actions.sync({ visible: state.visible, writable: state.writable, revision: 0 })
  const setSidebarVisible = vi.fn()
  const props: SidebarSettingsRowProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    setSidebarVisible,
    t,
  }
  const { container } = render(<SidebarSettingsRow {...props} />)
  return { store, setSidebarVisible, container }
}

describe('SidebarSettingsRow', () => {
  it('renders nothing before the scope accepted a section', () => {
    const { container } = mount({ visible: undefined, writable: false })
    expect(container.textContent).toBe('')
  })

  it('renders the switch state from the mirrored store and toggles through the face', () => {
    const { container, setSidebarVisible } = mount({ visible: true, writable: true })
    const switchButton = container.querySelector('[role="switch"]')!
    expect(switchButton.getAttribute('aria-checked')).toBe('true')
    expect(container.textContent).toContain('sidebar.show')
    fireEvent.click(switchButton)
    expect(setSidebarVisible).toHaveBeenCalledWith(false)
  })

  it('renders the off state without the on marker and toggles back on', () => {
    const { container, setSidebarVisible } = mount({ visible: false, writable: true })
    const switchButton = container.querySelector('[role="switch"]')!
    expect(switchButton.getAttribute('aria-checked')).toBe('false')
    expect(switchButton.querySelector('[data-on]')).toBeNull()
    fireEvent.click(switchButton)
    expect(setSidebarVisible).toHaveBeenCalledWith(true)
  })

  it('disables the switch while the scope is not writable', () => {
    const { container } = mount({ visible: true, writable: false })
    expect((container.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true)
  })
})
