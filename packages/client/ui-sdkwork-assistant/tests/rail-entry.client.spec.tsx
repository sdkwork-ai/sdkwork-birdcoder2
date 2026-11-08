// @vitest-environment jsdom
/**
 * Assistant rail entry spec: the 44px cell renders the outline robot glyph
 * while idle, swaps to the filled glyph with the selection chrome while active,
 * announces itself as 助理 in both the tooltip and the accessible name (the
 * icon-only control has no other visible name), and switches the frame mode on
 * click.
 */
import { describe, expect, it, vi } from 'vitest'
import { afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { AssistantRailEntry, type AssistantRailEntryProps } from '../src/client/RailEntry.tsx'

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

/** The entry reads neither standard hook; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())
const standard = {
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

/** Locale seat stand-in backed by the shipped dictionary, so the copy under test is the real one. */
async function assistantT() {
  const { zh } = await import('../src/client/locales.ts')
  return ((key: string) => (zh as Record<string, string>)[key] ?? key) as AssistantRailEntryProps['t']
}

describe('AssistantRailEntry', () => {
  afterEach(cleanup)

  it('announces 助理 and switches the frame mode on click', async () => {
    const t = await assistantT()
    const setMode = vi.fn()
    render(<AssistantRailEntry {...standard} mode="assistant" active={false} setMode={setMode} t={t} />)
    const button = screen.getByRole('button', { name: '助理' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    // Idle keeps the outline glyph (stroke paths present, no selection class).
    expect(button.querySelector('[stroke]')).not.toBeNull()
    expect(button.className).not.toContain('active')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('assistant')
  })

  it('renders the filled glyph with the selection chrome while active', async () => {
    const t = await assistantT()
    render(<AssistantRailEntry {...standard} mode="assistant" active setMode={() => {}} t={t} />)
    const button = screen.getByRole('button', { name: '助理' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('[stroke]')).toBeNull()
    expect(button.className).toContain('active')
  })
})
