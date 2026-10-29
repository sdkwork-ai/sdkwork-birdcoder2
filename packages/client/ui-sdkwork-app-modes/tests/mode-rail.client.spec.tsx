// @vitest-environment jsdom
/**
 * Mode rail shell spec: the shell renders one keyed entry seat per visible
 * mode in the user's layout order (the shipped layout shows the first five),
 * then the plus button that opens the customize dialog and the pinned mode;
 * the panel-shortcut seat sits directly above the Settings seat, both outside
 * the entries group (neither is an app mode). Hiding the active mode returns
 * the frame to the default mode, so no rail state strands the user. Entry
 * chrome and glyph behavior are the entries' own (their specs live beside
 * each entry component).
 */
import { describe, expect, it, vi } from 'vitest'
import { afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { ModeRail } from '../src/client/ModeRail.tsx'
import type { ModeRailProps } from '../src/client/ModeRail.tsx'
import { MODE_ORDER } from '../src/client/ModeRail.tsx'
import {
  CUSTOMIZABLE_MODES, DEFAULT_HIDDEN, DEFAULT_VISIBLE_COUNT, DEFAULT_VISIBLE_MODES, PINNED_MODE,
} from '../src/client/rail-modes.ts'
import type { RailLayoutState, RailLayoutStore } from '../src/client/rail-layout-store.ts'
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Empty global standard-kit hooks (the rail reads neither). */
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
const t = ((key: string) => key) as ModeRailProps['t']

/** The rail reads neither standard hook; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  ...allowAllAccess,
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

/** The shipped layout: the fixed modes plus Chat visible. */
function shippedLayout(): RailLayoutState {
  return { order: CUSTOMIZABLE_MODES, hidden: DEFAULT_HIDDEN }
}

/** A real rail layout store over an explicit start state (no localStorage coupling). */
function layoutStoreOf(state: RailLayoutState = shippedLayout()): RailLayoutStore {
  const store = createSnapshotStore<RailLayoutState>(state)
  return {
    get: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
    setVisible: (mode, visible) => {
      const current = store.getSnapshot()
      if (visible === !current.hidden.includes(mode)) return
      store.set({
        order: current.order,
        hidden: visible ? current.hidden.filter(id => id !== mode) : [...current.hidden, mode],
      })
    },
    moveBefore: (mode, reference) => {
      const rest = store.getSnapshot().order.filter(id => id !== mode)
      const index = reference === undefined ? rest.length : rest.indexOf(reference)
      if (index === -1) return
      store.set({ order: [...rest.slice(0, index), mode, ...rest.slice(index)], hidden: store.getSnapshot().hidden })
    },
    reset: () => { store.set(shippedLayout()) },
  }
}

/** Registered-entry mirror stub over an explicit key list. */
function registeredOf(keys: readonly string[]) {
  return createSnapshotStore<readonly string[]>(keys)
}

type RailSlotOwner = { active?: boolean; setMode?: (mode: AppModeId) => void; activeMode?: AppModeId }

/** Render-slot stub: one button per dispatched entry key, tagged with the owner props. */
function railRenderSlot(record: { key: string; active: boolean; setMode?: (mode: AppModeId) => void; activeMode?: AppModeId }[]) {
  return ((key: string, owner: RailSlotOwner, opts?: { entryKey?: string }) => {
    if (key === 'mode.rail.settings') {
      record.push({ key, active: false })
      return <button type="button" data-entry="settings" />
    }
    if (key === 'mode.rail.panel') {
      record.push({ key, active: false, activeMode: owner.activeMode })
      return <button type="button" data-entry="panel-shortcut" data-owner-mode={owner.activeMode} />
    }
    record.push({ key: opts?.entryKey ?? '?', active: owner.active ?? false, setMode: owner.setMode })
    return <button type="button" data-entry={opts?.entryKey} data-active={owner.active || undefined} />
  }) as ModeRailProps['renderSlot']
}

describe('ModeRail', () => {
  afterEach(cleanup)

  it('renders the default entries, the plus button, and the pinned mode, with the bottom seats outside the group', () => {
    const record: { key: string; active: boolean; activeMode?: AppModeId }[] = []
    const { container } = render(
      <ModeRail
        {...standard} mode="code" setMode={() => {}} t={t}
        renderSlot={railRenderSlot(record)}
        layout={layoutStoreOf()}
        registered={registeredOf([...MODE_ORDER])}
      />,
    )
    // The shipped layout shows the five fixed modes plus App Store; Token Plan
    // stays pinned at the group's end.
    expect(record.map(r => r.key)).toEqual(
      [...DEFAULT_VISIBLE_MODES, PINNED_MODE, 'mode.rail.panel', 'mode.rail.settings'])
    expect(DEFAULT_VISIBLE_MODES).toEqual(['code', 'video', 'image', 'appstore', 'knowledge', 'assets'])
    const group = container.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('rail.label')
    const tokenPlan = group.querySelector('[data-entry="token-plan"]')!
    expect([...tokenPlan.parentElement!.classList].some(name => name.includes('pinnedSeat'))).toBe(true)
    // The group holds the visible entries, the pinned mode, and the customize
    // plus button; the settings button and panel shortcuts live in the rail's
    // bottom seats.
    expect(group.querySelectorAll('button')).toHaveLength(DEFAULT_VISIBLE_COUNT + 2)
    const plus = screen.getByRole('button', { name: 'rail.customize' })
    expect(plus.getAttribute('aria-haspopup')).toBe('dialog')
    expect(screen.queryByRole('dialog')).toBeNull()
    const settings = container.querySelector('[data-entry="settings"]')!
    const panelShortcut = container.querySelector('[data-entry="panel-shortcut"]')!
    expect(group.contains(settings)).toBe(false)
    expect(group.contains(panelShortcut)).toBe(false)
    // The panel-shortcut seat sits directly above Settings, and it receives
    // the frame's live mode.
    expect(panelShortcut.parentElement!.nextElementSibling!.contains(settings)).toBe(true)
    expect(record.find(r => r.key === 'mode.rail.panel')?.activeMode).toBe('code')
    expect(panelShortcut.getAttribute('data-owner-mode')).toBe('code')
  })

  it('follows a customized layout: reordered visible entries, hidden entries absent, unregistered modes never offered', () => {
    const record: { key: string; active: boolean }[] = []
    const layout = layoutStoreOf({
      order: ['image', 'code', 'chat', 'contacts', 'video', 'appstore', 'knowledge', 'course', 'drive', 'assets', 'search'],
      hidden: ['contacts', 'knowledge'],
    })
    const { container } = render(
      <ModeRail
        {...standard} mode="code" setMode={() => {}} t={t}
        renderSlot={railRenderSlot(record)}
        layout={layout}
        // 'course' has no registered entry in this deployment: the seat and
        // the dialog row both stay out, and the empty dialog slot renders none.
        registered={registeredOf(['code', 'chat', 'contacts', 'video', 'image', 'appstore', 'knowledge'])}
      />,
    )
    const group = container.querySelector('[role="group"]')!
    const entries = [...group.querySelectorAll('[data-entry]')]
      .map(node => node.getAttribute('data-entry'))
      .filter(key => key !== 'settings' && key !== 'panel-shortcut')
    // Reordered visible entries, hidden ones gone, the unregistered 'course'
    // seat absent, and the pinned mode still last.
    expect(entries).toEqual(['image', 'code', 'chat', 'video', 'appstore', 'token-plan'])
  })

  it('marks only the active mode seat and hands every seat the owner switch untouched', () => {
    const record: { key: string; active: boolean; setMode?: (mode: AppModeId) => void; activeMode?: AppModeId }[] = []
    const setMode = vi.fn()
    render(
      <ModeRail
        {...standard} mode="video" setMode={setMode} t={t}
        renderSlot={railRenderSlot(record)}
        layout={layoutStoreOf()}
        registered={registeredOf([...MODE_ORDER])}
      />,
    )
    expect(record.filter(r => r.active).map(r => r.key)).toEqual(['video'])
    // A gated mode switch is the same write as any other: the rail opens no
    // sign-in surface of its own.
    record.find(r => r.key === 'image')!.setMode!('image')
    expect(setMode).toHaveBeenCalledWith('image')
  })

  it('opens the customize dialog on the plus button and hides the active mode back to the default mode', () => {
    const record: { key: string; active: boolean }[] = []
    const setMode = vi.fn()
    // The active Contacts seat is hideable: the shipped layout hides it, so
    // the layout under test keeps it visible to exercise the stranding guard.
    const layout = layoutStoreOf({
      order: [...CUSTOMIZABLE_MODES],
      hidden: DEFAULT_HIDDEN.filter(id => id !== 'contacts'),
    })
    const { container } = render(
      <ModeRail
        {...standard} mode="contacts" setMode={setMode} t={t}
        renderSlot={railRenderSlot(record)}
        layout={layout}
        registered={registeredOf([...MODE_ORDER])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rail.customize' }))
    const dialog = screen.getByRole('dialog', { name: 'rail.customize.title' })
    expect(dialog.querySelectorAll('[data-rail-customize-row]')).toHaveLength(CUSTOMIZABLE_MODES.length)
    // A fixed row renders disabled: the store keeps it visible whatever the
    // dialog does.
    const rows = [...dialog.querySelectorAll('[data-rail-customize-row]')]
    const videoRow = rows.find(row => row.textContent === 'mode.video')!
    expect((videoRow.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true)
    // Unchecking the active mode's row hides it from the rail AND returns the
    // frame to the default mode (the placeholder pages point users back at the
    // rail, so hiding the active button must not strand them).
    const contactsRow = rows.find(row => row.textContent === 'mode.contacts')!
    const checkbox = contactsRow.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    expect(layout.get().hidden).toContain('contacts')
    expect(setMode).toHaveBeenCalledWith('code')
    expect(container.querySelector('[data-entry="contacts"]')).toBeNull()
    // Reset restores the shipped layout (Contacts stays hidden there).
    fireEvent.click(screen.getByRole('button', { name: 'rail.customize.reset' }))
    expect(layout.get()).toEqual(shippedLayout())
    expect(container.querySelector('[data-entry="contacts"]')).toBeNull()
  })
})
