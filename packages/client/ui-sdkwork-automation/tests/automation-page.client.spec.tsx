// @vitest-environment jsdom
/**
 * Automation page spec: the tab bar renders the scheduled-tasks and
 * run-history views with Scheduled selected first, the scheduled view carries
 * the first-task empty state, the add affordance that opens the front-end-only
 * create dialog, and the twelve-card template catalog, and switching tabs
 * swaps the active panel marker and the empty-state copy.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { AutomationPage, type AutomationPageProps } from '../src/client/AutomationPage.tsx'

afterEach(() => { cleanup() })

/** Empty global standard-kit hooks (the page reads none). */
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
const t = ((key: string) => key) as AutomationPageProps['t']

/** The page reads none of the standard hooks; supply empty kit. */
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
}

function page() {
  return render(
    <AutomationPage {...standard} mode="automation" t={t} />,
  )
}

describe('AutomationPage', () => {
  it('renders the two view tabs with Scheduled selected first', () => {
    const view = page()
    const tablist = view.getByRole('tablist', { name: 'tabs.label' })
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'))
    expect(tabs.map(tab => tab.textContent)).toEqual(['tab.scheduled', 'tab.runs'])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
  })

  it('renders the scheduled empty state, the live add affordance, and the template catalog', () => {
    const view = page()
    const panel = view.container.querySelector('[data-automation-tab="scheduled"]')!
    expect(panel.textContent).toContain('empty.scheduled.title')
    const add = view.getByRole('button', { name: 'empty.scheduled.action' })
    // The affordance is live now: no inert markers, it opens the dialog.
    expect(add.getAttribute('aria-disabled')).toBeNull()
    expect(view.queryByRole('dialog', { name: 'create.title' })).toBeNull()
    fireEvent.click(add)
    expect(view.getByRole('dialog', { name: 'create.title' })).not.toBeNull()
    // The catalog lists all twelve template cards, each with its marker.
    const cards = view.container.querySelectorAll('[data-automation-template]')
    expect(cards).toHaveLength(12)
    expect(cards[0]!.getAttribute('data-automation-template')).toBe('news')
    expect(cards[0]!.textContent).toContain('template.news.title')
    expect(cards[0]!.textContent).toContain('template.news.description')
    expect(cards[11]!.getAttribute('data-automation-template')).toBe('wallpaper')
    expect(view.container.querySelector('[data-automation-tab="runs"]')).toBeNull()
  })

  it('opens the create dialog from the add affordance and closes it on cancel', () => {
    const view = page()
    fireEvent.click(view.getByRole('button', { name: 'empty.scheduled.action' }))
    const dialog = view.getByRole('dialog', { name: 'create.title' })
    expect(dialog.textContent).toContain('create.nameLabel')
    expect(dialog.textContent).toContain('create.promptLabel')
    expect(dialog.textContent).toContain('create.frequencyLabel')
    expect(dialog.textContent).toContain('create.validityLabel')
    // Confirm stays disabled on an empty name; cancel closes the dialog.
    const confirm = view.getByRole('button', { name: 'create.confirm' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(view.getByRole('button', { name: 'create.cancel' }))
    expect(view.queryByRole('dialog', { name: 'create.title' })).toBeNull()
  })

  it('switches to the runs view: its own empty state and no template catalog', () => {
    const view = page()
    const tablist = view.getByRole('tablist', { name: 'tabs.label' })
    const tabOf = (name: string): HTMLElement =>
      Array.from(tablist.querySelectorAll('[role="tab"]'))
        .find(tab => tab.textContent === name) as HTMLElement
    fireEvent.click(tabOf('tab.runs'))
    expect(tabOf('tab.runs').getAttribute('aria-selected')).toBe('true')
    expect(tabOf('tab.scheduled').getAttribute('aria-selected')).toBe('false')
    const panel = view.container.querySelector('[data-automation-tab="runs"]')!
    expect(panel.textContent).toContain('empty.runs.title')
    expect(panel.textContent).toContain('empty.runs.hint')
    expect(view.queryByRole('button', { name: 'empty.scheduled.action' })).toBeNull()
    expect(view.container.querySelector('[data-automation-template]')).toBeNull()
    // Back to Scheduled restores the empty state with the catalog.
    fireEvent.click(tabOf('tab.scheduled'))
    expect(view.container.querySelector('[data-automation-tab="scheduled"]')).not.toBeNull()
    expect(view.container.querySelectorAll('[data-automation-template]')).toHaveLength(12)
  })
})
