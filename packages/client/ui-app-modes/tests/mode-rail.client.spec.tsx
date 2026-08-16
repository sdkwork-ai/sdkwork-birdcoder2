// @vitest-environment jsdom
/**
 * Mode rail shell spec: the shell renders one keyed entry seat per mode id
 * in launcher order, handing each seat the live selection facts (active +
 * setMode), plus the bottom-pinned settings seat outside the entries group.
 * Entry chrome and glyph behavior are the entries' own (their specs live
 * beside each entry component).
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { ModeRail, MODE_ORDER } from '../src/client/ModeRail.tsx'
import type { ModeRailProps } from '../src/client/ModeRail.tsx'

/** Empty global standard-kit hooks (the rail reads neither). */
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
const t = ((key: string) => key) as ModeRailProps['t']

/** The rail reads neither standard hook; supply empty kit. */
const standard = { useSessions: emptySessions(), useWorkspaces: emptyWorkspaces() }

/** Render-slot stub: one button per dispatched entry key, tagged with the owner props. */
function railRenderSlot(record: { key: string; active: boolean }[]) {
  return ((key: string, owner: { active?: boolean }, opts?: { entryKey?: string }) => {
    if (key === 'mode.rail.settings') {
      record.push({ key, active: false })
      return <button type="button" data-entry="settings" />
    }
    record.push({ key: opts?.entryKey ?? '?', active: owner.active ?? false })
    return <button type="button" data-entry={opts?.entryKey} data-active={owner.active || undefined} />
  }) as ModeRailProps['renderSlot']
}

describe('ModeRail', () => {
  it('renders one entry seat per mode id in launcher order and the settings seat outside the group', () => {
    const record: { key: string; active: boolean }[] = []
    const { container } = render(
      <ModeRail {...standard} mode="code" setMode={() => {}} t={t} renderSlot={railRenderSlot(record)} />,
    )
    expect(record.map(r => r.key)).toEqual([...MODE_ORDER, 'mode.rail.settings'])
    const group = container.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('rail.label')
    // The settings button lives in the rail's bottom seat, outside the
    // entries group (it is not an app mode).
    expect(group.querySelectorAll('button')).toHaveLength(MODE_ORDER.length)
    const settings = container.querySelector('[data-entry="settings"]')!
    expect(group.contains(settings)).toBe(false)
  })

  it('marks only the active mode seat and passes the switch action through', () => {
    const record: { key: string; active: boolean }[] = []
    const setMode = vi.fn()
    const { container } = render(
      <ModeRail {...standard} mode="video" setMode={setMode} t={t} renderSlot={railRenderSlot(record)} />,
    )
    expect(record.filter(r => r.active).map(r => r.key)).toEqual(['video'])
    const activeSeat = container.querySelector('[data-active]')!
    expect(activeSeat.getAttribute('data-entry')).toBe('video')
  })
})
