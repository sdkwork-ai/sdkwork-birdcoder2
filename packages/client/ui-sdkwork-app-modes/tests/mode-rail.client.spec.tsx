// @vitest-environment jsdom
/**
 * Mode rail shell spec: the shell renders one keyed entry seat per mode id
 * in launcher order, handing each seat the live selection facts (active +
 * setMode, passed through untouched — the rail opens no sign-in surface).
 * Token Plan is pinned beside the bottom cluster, whose panel-shortcut seat
 * sits directly above the Settings seat; both stay outside the entries group
 * (neither is an app mode). Entry chrome and glyph behavior are the entries'
 * own (their specs live beside each entry component).
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { ModeRail, MODE_ORDER } from '../src/client/ModeRail.tsx'
import type { ModeRailProps } from '../src/client/ModeRail.tsx'
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

/** Empty pending-interaction source (the rail reads none). */

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
  it('renders one entry seat per mode id in launcher order, then the panel shortcuts and the settings seat', () => {
    const record: { key: string; active: boolean; activeMode?: AppModeId }[] = []
    const { container } = render(
      <ModeRail {...standard} mode="code" setMode={() => {}} t={t} renderSlot={railRenderSlot(record)} />,
    )
    expect(record.map(r => r.key)).toEqual([...MODE_ORDER, 'mode.rail.panel', 'mode.rail.settings'])
    // The IM modes sit directly below Code, as the product's rail order requires.
    expect(MODE_ORDER.slice(0, 3)).toEqual(['code', 'chat', 'contacts'])
    expect(MODE_ORDER.at(-1)).toBe('token-plan')
    expect(record.at(-3)?.key).toBe('token-plan')
    const group = container.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('rail.label')
    const tokenPlan = group.querySelector('[data-entry="token-plan"]')!
    expect([...tokenPlan.parentElement!.classList].some(name => name.includes('pinnedSeat'))).toBe(true)
    // The settings button and the panel shortcuts live in the rail's bottom
    // seats, outside the entries group (neither is an app mode).
    expect(group.querySelectorAll('button')).toHaveLength(MODE_ORDER.length)
    const settings = container.querySelector('[data-entry="settings"]')!
    const panelShortcut = container.querySelector('[data-entry="panel-shortcut"]')!
    expect(group.contains(settings)).toBe(false)
    expect(group.contains(panelShortcut)).toBe(false)
    // The panel-shortcut seat sits directly above Settings.
    expect(panelShortcut.parentElement!.nextElementSibling!.contains(settings)).toBe(true)
    // It receives the frame's live mode, so a shortcut that opens its own mode
    // page can paint the active cell.
    expect(record.find(r => r.key === 'mode.rail.panel')?.activeMode).toBe('code')
    expect(panelShortcut.getAttribute('data-owner-mode')).toBe('code')
  })

  it('marks only the active mode seat and hands every seat the owner switch untouched', () => {
    const record: { key: string; active: boolean; setMode?: (mode: AppModeId) => void; activeMode?: AppModeId }[] = []
    const setMode = vi.fn()
    const { container } = render(
      <ModeRail {...standard} mode="video" setMode={setMode} t={t} renderSlot={railRenderSlot(record)} />,
    )
    expect(record.filter(r => r.active).map(r => r.key)).toEqual(['video'])
    expect(record.find(r => r.key === 'mode.rail.panel')?.activeMode).toBe('video')
    const activeSeat = container.querySelector('[data-active]')!
    expect(activeSeat.getAttribute('data-entry')).toBe('video')
    // A gated mode switch is the same write as any other: the rail opens no
    // sign-in surface of its own.
    record.find(r => r.key === 'knowledge')!.setMode!('knowledge')
    expect(setMode).toHaveBeenCalledWith('knowledge')
  })
})
