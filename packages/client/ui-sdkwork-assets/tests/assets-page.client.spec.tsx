// @vitest-environment jsdom
/** Assets placeholder page spec: renders its mode id, name, and notice. */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { AssetsPage, type AssetsPageProps } from '../src/client/AssetsPage.tsx'
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Empty global standard-kit hooks (the page reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', subagentsByParent: {}, jobsBySession: {} })
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

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as AssetsPageProps['t']

/** The page reads neither standard hook; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

describe('AssetsPage', () => {
  it('renders the mode name and placeholder copy with its mode id', () => {
    const { container } = render(<AssetsPage {...standard} mode="assets" t={t} />)
    const page = container.querySelector('[data-mode="assets"]')!
    expect(page.getAttribute('data-mode-page')).toBe('assets')
    expect(page.textContent).toContain('mode.assets')
    expect(page.textContent).toContain('page.placeholder')
    expect(page.textContent).toContain('page.back')
  })
})
