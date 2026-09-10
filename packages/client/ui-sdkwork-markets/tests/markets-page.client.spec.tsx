// @vitest-environment jsdom
/**
 * Markets page spec: the page is public — it renders its catalog chrome
 * without any IAM gate face — the header renders the four market categories
 * with Plugins selected first plus the per-category search field, the Plugins
 * tab carries the add affordance (create-plugin dispatch / add-market
 * dialog), the Skills tab carries its own (find-skills dispatch /
 * import-skill dialog / skill-creator dispatch), the other tabs keep the
 * inert my-catalog affordance, and switching tabs swaps the active panel
 * marker, the category's empty notice, and the tools' copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginInventoryEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { MarketsPage, type MarketsPageProps } from '../src/client/MarketsPage.tsx'

// The embedded SDKWork market page is mocked: its panel copy is rendered
// verbatim so assertions read the page contract without the App Store stack.
vi.mock('../src/client/marketsHost.ts', () => ({
  MarketsApp: ({ page, t }: { page: string; t: (key: string) => string }) => (
    <div data-testid={`markets-app-${page}`}>Market surface {page} {t(`panel.${page}.empty`)}</div>
  ),
}))

afterEach(() => { cleanup() })

/** The dispatch double: records the composed prompts. */
const dispatchPrompt = vi.fn()

/** The installed tab's configure double: records the configured rows. */
const onConfigure = vi.fn()

// The doubles are module-level; clear the per-test tally.
beforeEach(() => {
  dispatchPrompt.mockClear()
  onConfigure.mockClear()
})

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
const t = ((key: string) => key) as MarketsPageProps['t']

/** The page reads none of the standard hooks; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
  usePanelInfo, useResource,
}

/**
 * The local/installed tabs' doubles: an inventory answering two entries (one
 * enabled cloud module, one disabled local path) and a settings resolver that
 * makes the `shell` module configurable.
 */
const inventoryEntries = [
  { entryId: 'e1', moduleName: '@deepseek-ai/dsh-host-shell', enabled: true, fiberPhase: 'active' },
  { entryId: 'e2', moduleName: './packages/local-plugin', enabled: false, fiberPhase: null },
  // The page only reads and echoes entry ids back, so the doubles skip the
  // Loader's PluginEntryId branding.
] as unknown as readonly PluginInventoryEntry[]

function page() {
  return render(
    <MarketsPage
      {...standard}
      mode="markets"
      t={t}
      dispatchPrompt={dispatchPrompt}
      listPlugins={async () => ({ entries: [...inventoryEntries] })}
      settingsTarget={row => (
        row.name.toLocaleLowerCase().endsWith('shell')
          ? { configurable: true, namespace: 'shell' }
          : { configurable: false }
      )}
      onConfigure={onConfigure}
    />,
  )
}

/** Click one category tab by its verbatim key. */
function clickTab(view: ReturnType<typeof page>, name: string): void {
  const tab = Array.from(view.getByRole('tablist', { name: 'tabs.label' }).querySelectorAll('[role="tab"]'))
    .find(candidate => candidate.textContent === name) as HTMLElement
  fireEvent.click(tab)
}

/** Click one Plugins sub-tab chip by its data-plugin-subtab id. */
function clickPluginSubTab(view: ReturnType<typeof page>, id: 'cloud' | 'local' | 'installed'): void {
  const chip = view.container.querySelector(`[data-plugin-subtab="${id}"]`) as HTMLElement
  fireEvent.click(chip)
}

describe('MarketsPage', () => {
  it('renders signed out: no auth-required chrome and the header mounts directly', () => {
    const view = page()
    expect(view.container.querySelector('[data-auth-required="true"]')).toBeNull()
    expect(view.container.querySelector('[data-mode-page="markets"]')).not.toBeNull()
    expect(view.queryByText('auth.required.title')).toBeNull()
    expect(view.getByRole('tablist', { name: 'tabs.label' })).not.toBeNull()
  })

  it('renders the four category tabs with Plugins selected first and the header tools', () => {
    const view = page()
    const tablist = view.getByRole('tablist', { name: 'tabs.label' })
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'))
    expect(tabs.map(tab => tab.textContent))
      .toEqual([
        'tab.plugins', 'tab.experts', 'tab.skills', 'tab.connectors',
      ])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
    // The Plugins sub-tab strip is mounted below the main bar, with the
    // cloud chip selected (the default landing view).
    const subTablist = view.getByRole('tablist', { name: 'subtabs.label' })
    const subChips = Array.from(subTablist.querySelectorAll('[role="tab"]'))
    expect(subChips.map(chip => chip.getAttribute('data-plugin-subtab')))
      .toEqual(['cloud', 'local', 'installed'])
    expect(subChips[0]!.getAttribute('aria-selected')).toBe('true')
    // The Plugins panel is the active one, and the tools speak Plugins.
    expect(view.container.querySelector('[data-markets-tab="plugins"]')!.textContent)
      .toContain('panel.plugins.empty')
    expect(view.getByTestId('markets-app-plugins')).toBeTruthy()
    const search = view.getByRole('searchbox', { name: 'search.plugins' })
    expect(search.getAttribute('placeholder')).toBe('search.plugins')
    // The Plugins tab's add affordance replaces the inert my-catalog button.
    expect(view.container.querySelector('[data-markets-add]')).not.toBeNull()
    expect(view.queryByRole('button', { name: 'mine.plugins' })).toBeNull()
  })

  it('switches the active panel and the tools copy on tab click', () => {
    const view = page()
    clickTab(view, 'tab.skills')
    expect(view.container.querySelector('[data-markets-tab="skills"]')!.textContent)
      .toContain('panel.skills.empty')
    // The Skills tab renders the SDKWork skills market page.
    expect(view.getByTestId('markets-app-skills')).toBeTruthy()
    expect(view.getByRole('searchbox', { name: 'search.skills' }).getAttribute('placeholder'))
      .toBe('search.skills')
    // The Skills tab carries its own add affordance (find/upload/create).
    expect(view.container.querySelector('[data-markets-add="skills"]')).not.toBeNull()
    expect(view.queryByRole('button', { name: 'mine.skills' })).toBeNull()

    clickTab(view, 'tab.connectors')
    // The Connectors tab maps to the storefront's MCP catalog page.
    expect(view.container.querySelector('[data-markets-tab="connectors"]')!.textContent)
      .toContain('panel.mcp.empty')
    expect(view.getByTestId('markets-app-mcp')).toBeTruthy()
    expect(view.getByRole('searchbox', { name: 'search.connectors' })).not.toBeNull()
    expect(view.getByRole('button', { name: 'mine.connectors' })).not.toBeNull()

    // Back to Experts restores the experts panel and tools.
    clickTab(view, 'tab.experts')
    expect(view.container.querySelector('[data-markets-tab="experts"]')!.textContent)
      .toContain('panel.experts.empty')
    expect(view.getByRole('searchbox', { name: 'search.experts' })).not.toBeNull()

    // Plugins mounts its add affordance again.
    clickTab(view, 'tab.plugins')
    expect(view.container.querySelector('[data-markets-add]')).not.toBeNull()
  })

  it('renders the local plugin list from this application inventory', async () => {
    const view = page()
    clickPluginSubTab(view, 'local')
    // The local sub-tab is a view over the running application, not a
    // market page; the cloud chip's embedded surface leaves the panel.
    await waitFor(() => {
      expect(view.container.querySelector('[data-local-scope="local"]')).not.toBeNull()
    })
    expect(view.container.querySelector('[data-markets-app-plugins]')).toBeNull()
    // The header search placeholder narrows to the local scope.
    const search = view.getByRole('searchbox', { name: 'search.local' })
    expect(search.getAttribute('placeholder')).toBe('search.local')
    // Both inventory entries are listed, tagged by origin and enablement.
    const rows = Array.from(view.container.querySelectorAll('[data-plugin-module]'))
    expect(rows.map(row => row.getAttribute('data-plugin-origin')))
      .toEqual(['cloud', 'local'])
    expect(rows.map(row => row.getAttribute('data-enabled'))).toEqual(['true', 'false'])
    // The local sub-tab is a roster: no per-row Settings affordance.
    expect(view.queryByRole('button', { name: 'installed.settings' })).toBeNull()
  })

  it('renders only enabled plugins on the installed sub-tab', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.container.querySelector('[data-local-scope="installed"]')).not.toBeNull()
    })
    const rows = Array.from(view.container.querySelectorAll('[data-plugin-module]'))
    // The disabled local entry is filtered out of the installed set.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.getAttribute('data-plugin-origin')).toBe('cloud')
    expect(rows[0]!.getAttribute('data-enabled')).toBe('true')
  })

  it('opens a configurable installed plugin settings from its row', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.getByRole('button', { name: 'installed.settings' })).not.toBeNull()
    })
    fireEvent.click(view.getByRole('button', { name: 'installed.settings' }))
    expect(onConfigure).toHaveBeenCalledTimes(1)
    const [row] = onConfigure.mock.calls[0] as [{ name: string }]
    expect(row.name).toContain('shell')
  })

  it('collapses the sub-tab strip out of the DOM for the other main categories', () => {
    const view = page()
    expect(view.container.querySelector('[data-plugins-subtabs]')).not.toBeNull()
    clickTab(view, 'tab.experts')
    expect(view.container.querySelector('[data-plugins-subtabs]')).toBeNull()
    clickTab(view, 'tab.plugins')
    // Re-entering Plugins restores the strip on the default cloud sub-tab.
    expect(view.container.querySelector('[data-plugins-subtabs]')).not.toBeNull()
    expect(view.container.querySelector('[data-plugin-subtab="cloud"]')!.getAttribute('aria-selected'))
      .toBe('true')
  })

  it('switches the active panel when the sub-tab changes', async () => {
    const view = page()
    // Default cloud sub-tab mounts the appstore surface.
    expect(view.getByTestId('markets-app-plugins')).toBeTruthy()
    clickPluginSubTab(view, 'local')
    await waitFor(() => {
      expect(view.container.querySelector('[data-local-scope="local"]')).not.toBeNull()
    })
    expect(view.container.querySelector('[data-markets-tab="plugins"]')!.getAttribute('data-plugins-subtab'))
      .toBe('local')
    // Back to cloud restores the appstore surface.
    clickPluginSubTab(view, 'cloud')
    await waitFor(() => {
      expect(view.getByTestId('markets-app-plugins')).toBeTruthy()
    })
    expect(view.container.querySelector('[data-local-scope]')).toBeNull()
  })

  it('accepts search input and clears it when the category switches', () => {
    const view = page()
    const search = view.getByRole('searchbox', { name: 'search.plugins' }) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'code-review' } })
    expect(search.value).toBe('code-review')
    clickTab(view, 'tab.skills')
    expect((view.getByRole('searchbox', { name: 'search.skills' }) as HTMLInputElement).value).toBe('')
  })

  it('dispatches the create-plugin prompt from the add menu', () => {
    const view = page()
    fireEvent.click(view.getByRole('button', { name: 'add.aria' }))
    const menu = view.getByRole('menu', { name: 'add.aria' })
    expect(menu).not.toBeNull()
    fireEvent.click(view.getByRole('menuitem', { name: 'add.create.title' }))
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.create')
    // The menu closes after selection.
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('opens the add-market dialog from the menu and submits the composed prompt', () => {
    const view = page()
    fireEvent.click(view.getByRole('button', { name: 'add.aria' }))
    fireEvent.click(view.getByRole('menuitem', { name: 'add.market.title' }))
    expect(view.queryByRole('menu')).toBeNull()

    const dialog = view.getByRole('dialog', { name: 'dialog.market.title' })
    expect(dialog).not.toBeNull()

    // The gated submit: a blank source keeps the button disabled.
    const submit = view.getByRole('button', { name: 'dialog.submit' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.change(view.getByRole('textbox', { name: 'dialog.market.source' }),
      { target: { value: 'owner/repo' } })
    expect((view.getByRole('button', { name: 'dialog.submit' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(view.getByRole('textbox', { name: 'dialog.market.ref' }),
      { target: { value: 'v2' } })
    fireEvent.change(view.getByRole('textbox', { name: 'dialog.market.sparse' }),
      { target: { value: 'plugins/codex' } })
    fireEvent.click(view.getByRole('button', { name: 'dialog.submit' }))
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
    // The verbatim-key locale seat renders the template key; the composed
    // value is exactly what marketPrompt handed back.
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.market')
    // The dialog closes after submit.
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('dismisses the add-market dialog without dispatching', () => {
    const view = page()
    fireEvent.click(view.getByRole('button', { name: 'add.aria' }))
    fireEvent.click(view.getByRole('menuitem', { name: 'add.market.title' }))
    fireEvent.change(view.getByRole('textbox', { name: 'dialog.market.source' }),
      { target: { value: 'owner/repo' } })
    fireEvent.click(view.getByRole('button', { name: 'dialog.cancel' }))
    expect(view.queryByRole('dialog')).toBeNull()
    expect(dispatchPrompt).not.toHaveBeenCalled()
  })

  it('dispatches the find-skills prompt from the skills add menu', () => {
    const view = page()
    clickTab(view, 'tab.skills')
    fireEvent.click(view.getByRole('button', { name: 'skills.add.aria' }))
    const menu = view.getByRole('menu', { name: 'skills.add.aria' })
    expect(menu).not.toBeNull()
    fireEvent.click(view.getByRole('menuitem', { name: 'skills.find.title' }))
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.skills.find.template')
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('dispatches the create-skill prompt from the skills add menu', () => {
    const view = page()
    clickTab(view, 'tab.skills')
    fireEvent.click(view.getByRole('button', { name: 'skills.add.aria' }))
    fireEvent.click(view.getByRole('menuitem', { name: 'skills.create.title' }))
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.skills.create')
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('opens the import-skill dialog from the skills add menu and submits after a file pick', () => {
    const view = page()
    clickTab(view, 'tab.skills')
    fireEvent.click(view.getByRole('button', { name: 'skills.add.aria' }))
    fireEvent.click(view.getByRole('menuitem', { name: 'skills.upload.title' }))
    expect(view.queryByRole('menu')).toBeNull()

    const dialog = view.getByRole('dialog', { name: 'dialog.skill.title' })
    expect(dialog).not.toBeNull()

    // The gated submit: no file picked keeps the button disabled.
    const submit = view.getByRole('button', { name: 'dialog.skill.submit' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    // Picking a file through the hidden input arms the submit.
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'my-skill.zip')] })
    fireEvent.change(input)
    expect(view.getByRole('button', { name: 'dialog.skill.submit' }).textContent)
      .toBe('dialog.skill.submit')
    expect((view.getByRole('button', { name: 'dialog.skill.submit' }) as HTMLButtonElement).disabled)
      .toBe(false)

    fireEvent.click(view.getByRole('button', { name: 'dialog.skill.submit' }))
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.skills.import')
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('dismisses the import-skill dialog without dispatching', () => {
    const view = page()
    clickTab(view, 'tab.skills')
    fireEvent.click(view.getByRole('button', { name: 'skills.add.aria' }))
    fireEvent.click(view.getByRole('menuitem', { name: 'skills.upload.title' }))
    fireEvent.click(view.getByRole('button', { name: 'dialog.cancel' }))
    expect(view.queryByRole('dialog')).toBeNull()
    expect(dispatchPrompt).not.toHaveBeenCalled()
  })

  it('dispatches the find-skills prompt with the query on Enter in the skills search', () => {
    const view = page()
    clickTab(view, 'tab.skills')
    const search = view.getByRole('searchbox', { name: 'search.skills' })
    fireEvent.change(search, { target: { value: 'pdf' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.skills.find')
    // Non-Enter keys never dispatch.
    fireEvent.keyDown(search, { key: 'a' })
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
  })
})
