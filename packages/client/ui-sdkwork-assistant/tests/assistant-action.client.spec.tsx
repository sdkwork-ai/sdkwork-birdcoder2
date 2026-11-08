// @vitest-environment jsdom
/**
 * Assistant sidebar entry spec: the quick-entry row in the New Session button
 * area renders the robot glyph and the 助理 label with the same geometry as the
 * scheduled-tasks entry, keeps no background behind the text, and opens the
 * linked layer's main panel on click.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { AssistantAction, type AssistantActionProps } from '../src/client/AssistantAction.tsx'

const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Empty global standard-kit hooks (the row reads none). */
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
const t = ((key: string) => key) as AssistantActionProps['t']

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

const standard = {
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

/** Props for one row render at a given sidebar width. */
function actionProps(wide: boolean, open = vi.fn()) {
  return { ...standard, wide, open, startSession: vi.fn(), t }
}

describe('AssistantAction', () => {
  it('renders the icon and label in the wide row without any artwork background', () => {
    const open = vi.fn()
    const { container } = render(<AssistantAction {...actionProps(true, open)} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('entry.aria')
    expect(button.textContent).toBe('entry.label')
    // The label is plain text inside the row: no image, avatar, or badge.
    expect(button.querySelectorAll('img')).toHaveLength(0)
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(button.querySelectorAll('svg [stroke]').length).toBeGreaterThan(0)
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('renders the icon-only control in the collapsed rail', () => {
    const { container } = render(<AssistantAction {...actionProps(false)} />)
    const button = container.querySelector('button')!
    expect(button.textContent).toBe('')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
  })
})
