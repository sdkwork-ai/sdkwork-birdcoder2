// @vitest-environment jsdom
/**
 * Placeholder mode page spec: the page renders its own mode id, the mode
 * name, and the construction notice.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { ModePage } from '../src/client/ModePage.tsx'
import type { ModePageProps } from '../src/client/ModePage.tsx'

/** Empty global standard-kit hooks (the page reads neither). */
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

/** Empty pending-interaction source (the page reads none). */
function noPendingInteraction() {
  return bindSnapshotSelector(createSnapshotStore(new Map<never, never>()))
}

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as ModePageProps['t']

/** The page reads neither standard hook; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
  usePanelInfo, useResource,
}

describe('ModePage', () => {
  it('renders the mode name and placeholder copy with its mode id', () => {
    const { container } = render(<ModePage {...standard} mode="work" t={t} />)
    const page = container.querySelector('[data-mode="work"]')!
    expect(page.textContent).toContain('mode.work')
    expect(page.textContent).toContain('page.placeholder')
    expect(page.textContent).toContain('page.back')
  })

  it('renders the document placeholder against its own mode id', () => {
    const { container } = render(<ModePage {...standard} mode="document" t={t} />)
    const page = container.querySelector('[data-mode="document"]')!
    expect(page.textContent).toContain('mode.document')
    expect(page.textContent).toContain('page.placeholder')
    // The placeholder page's hero glyph renders from the mode icon map.
    expect(page.querySelector('svg')).not.toBeNull()
  })
})
