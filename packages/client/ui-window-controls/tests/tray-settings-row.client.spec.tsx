// @vitest-environment jsdom
/** TraySettingsRow behavior: renders nothing before a value exists, paints the
 * switch from the store mirror, toggles through the injected write, and
 * disables while unwritable. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TraySettingsRow, type TraySettingsRowProps } from '../src/client/TraySettingsRow.tsx'
import { createTraySettingsRowStore } from '../src/client/tray-settings-store.ts'

afterEach(cleanup)

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

function mount(state: { enabled: boolean | undefined; writable: boolean }) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createTraySettingsRowStore().create()
  store.actions.sync({ enabled: state.enabled, writable: state.writable, revision: 0 })
  const setCloseToTray = vi.fn()
  const props: TraySettingsRowProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    setCloseToTray,
  }
  const { container } = render(<TraySettingsRow {...props} />)
  return { store, setCloseToTray, container }
}

describe('TraySettingsRow', () => {
  it('renders nothing before the settings scope accepts a section', () => {
    const { container } = mount({ enabled: undefined, writable: false })
    expect(container.innerHTML).toBe('')
  })

  it('renders the copy and a switch reflecting the persisted preference', () => {
    mount({ enabled: true, writable: true })
    expect(screen.getByText('关闭窗口时最小化到托盘')).toBeDefined()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('toggles through the injected write and follows the store mirror', () => {
    const b = mount({ enabled: true, writable: true })
    fireEvent.click(screen.getByRole('switch'))
    expect(b.setCloseToTray).toHaveBeenCalledWith(false)
    // No store write yet: the switch still reads the mirror.
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    act(() => { b.store.actions.sync({ enabled: false, writable: true, revision: 1 }) })
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })

  it('disables the switch while the document is not writable', () => {
    mount({ enabled: false, writable: false })
    expect(screen.getByRole('switch')).toHaveProperty('disabled', true)
  })
})
