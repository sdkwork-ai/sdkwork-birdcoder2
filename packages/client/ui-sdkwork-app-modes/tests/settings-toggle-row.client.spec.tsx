// @vitest-environment jsdom
/**
 * Settings-toggle row spec: renders nothing until the scope accepts a section,
 * mirrors the mirrored store, routes the switch write through the injected
 * face, and takes its copy from that face — the same component backs both
 * General rows, so the row must not know which preference it edits.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { SettingsToggleRow, type SettingsToggleRowProps } from '../src/client/SettingsToggleRow.tsx'
import { createSettingsToggleStore } from '../src/client/settings-toggle-store.ts'
import type { AppModeKey } from '../src/client/locales.ts'
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Empty global standard-kit hooks (the row reads neither). */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })

/** Empty global standard-kit hooks (the row reads neither). */
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
const t = ((key: string) => key) as SettingsToggleRowProps['t']

/** The copy the registration injects for one row. */
const SIDEBAR_COPY: { titleKey: AppModeKey; descriptionKey: AppModeKey } = {
  titleKey: 'sidebar.show',
  descriptionKey: 'sidebar.show.description',
}

function mount(
  state: { value: boolean | undefined; writable: boolean },
  copy: { titleKey: AppModeKey; descriptionKey: AppModeKey } = SIDEBAR_COPY,
) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createSettingsToggleStore().create()
  store.actions.sync({ value: state.value, writable: state.writable, revision: 0 })
  const setVisible = vi.fn()
  const props: SettingsToggleRowProps = {
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useSessionStatus,
    useSessionRetainInfo: () => undefined,
    usePanelInfo, useResource,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    ...copy,
    setVisible,
    t,
  }
  const { container } = render(<SettingsToggleRow {...props} />)
  return { store, setVisible, container }
}

describe('SettingsToggleRow', () => {
  it('renders nothing before the scope accepted a section', () => {
    const { container } = mount({ value: undefined, writable: false })
    expect(container.textContent).toBe('')
  })

  it('renders the switch state from the mirrored store and toggles through the face', () => {
    const { container, setVisible } = mount({ value: true, writable: true })
    const switchButton = container.querySelector('[role="switch"]')!
    expect(switchButton.getAttribute('aria-checked')).toBe('true')
    expect(container.textContent).toContain('sidebar.show')
    expect(container.textContent).toContain('sidebar.show.description')
    fireEvent.click(switchButton)
    expect(setVisible).toHaveBeenCalledWith(false)
  })

  it('renders the off state without the on marker and toggles back on', () => {
    const { container, setVisible } = mount({ value: false, writable: true })
    const switchButton = container.querySelector('[role="switch"]')!
    expect(switchButton.getAttribute('aria-checked')).toBe('false')
    expect(switchButton.querySelector('[data-on]')).toBeNull()
    fireEvent.click(switchButton)
    expect(setVisible).toHaveBeenCalledWith(true)
  })

  it('disables the switch while the scope is not writable', () => {
    const { container } = mount({ value: true, writable: false })
    expect((container.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('reads its copy from the injected face instead of hardcoding one row', () => {
    const { container } = mount(
      { value: true, writable: true },
      { titleKey: 'heroSwitch.show', descriptionKey: 'heroSwitch.show.description' },
    )

    expect(container.textContent).toContain('heroSwitch.show')
    expect(container.textContent).not.toContain('sidebar.show')
    expect(container.querySelector('[role="switch"]')!.getAttribute('aria-label')).toBe('heroSwitch.show')
  })
})
