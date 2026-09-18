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
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BundleInfo, ChangeResult, PluginInstallCancellation, PluginInventoryEntry,
  PluginSpecInspection,
} from '@deepseek-ai/dsh-api-remotes/client'
import { MarketsPage, type MarketsPageProps } from '../src/client/MarketsPage.tsx'
import type { OfficialItem } from '../src/client/configItems.ts'
import { emptyInstallSession, type PluginStore, type PluginStoreState } from '../src/client/pluginStore.ts'

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
  clearStoreDoubles()
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

/** Locale seat stand-in: keys render verbatim so assertions read the contract.
 * Parameters are appended, so a case that cares about the value a key was
 * given (an install's settled bundle name) can assert on it directly. */
const t = ((key: string, params?: Record<string, string>) => (
  params === undefined ? key : `${key}(${Object.values(params).join(',')})`
)) as MarketsPageProps['t']

/** What one interpolated key rendered, for assertions on the parameters. */
function spelled(key: string, ...values: string[]): string {
  return `${key}(${values.join(',')})`
}

/** The page reads none of the standard hooks; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionPendingInteraction: noPendingInteraction(),
  usePanelInfo, useResource,
}

/**
 * The plugin store double: the market panel reads one published state and
 * writes through the store, so the spec drives it exactly as the plugin
 * would — a read that answers the inventory plus the manager's roster and
 * bundles, and write doubles whose answers decide what the panel reports.
 *
 * The write seats are typed with their real signatures (not `ReturnType<typeof
 * vi.fn>`, which widens to `Mock<Procedure | Constructable>`) so a test can
 * program an answer with `.mockResolvedValue` and still call the seat.
 */
interface StoreDoubles {
  /** Register the answer to the entry-roster write. */
  setPluginEnabled: Mock<(id: string, enabled: boolean) => Promise<ChangeResult>>
  /** Register the answer to the bundle-layer write. */
  setBundleEnabled: Mock<(name: string, enabled: boolean) => Promise<ChangeResult>>
  /** Register the answer to the bundle uninstall. */
  removeBundle: Mock<(name: string) => Promise<ChangeResult>>
  /** Register the answer to the pre-install inspection. */
  inspect: Mock<(spec: string) => Promise<PluginSpecInspection>>
  /** Register the answer to the install run. */
  installBundle: Mock<(spec: string) => Promise<ChangeResult>>
  /** Register the answer to the run cancellation. */
  cancelInstall: Mock<() => Promise<PluginInstallCancellation>>
  /** How many times the panel asked for a re-read. */
  refreshes: number
}

function makeStoreDoubles(): StoreDoubles {
  return {
    setPluginEnabled: vi.fn(),
    setBundleEnabled: vi.fn(),
    removeBundle: vi.fn(),
    inspect: vi.fn(),
    installBundle: vi.fn(),
    cancelInstall: vi.fn(),
    refreshes: 0,
  }
}

let storeDoubles: StoreDoubles = makeStoreDoubles()

/** Reset the write doubles to their default applied answers. */
function clearStoreDoubles(): void {
  storeDoubles = makeStoreDoubles()
  storeDoubles.setPluginEnabled.mockResolvedValue(
    { changed: true, application: 'applied', stage: 'enable', target: 'e1' })
  storeDoubles.setBundleEnabled.mockResolvedValue(
    { changed: true, application: 'applied', stage: 'enable', target: 'b1' })
  storeDoubles.removeBundle.mockResolvedValue(
    { changed: true, application: 'applied', stage: 'remove', target: 'b1' })
  storeDoubles.inspect.mockResolvedValue({ status: 'accepted', kind: 'registry', name: 'demo-plugin', bundle: true })
  storeDoubles.installBundle.mockResolvedValue(
    { changed: true, application: 'applied', stage: 'enable', target: 'demo-plugin', bundle: 'demo-plugin' })
  storeDoubles.cancelInstall.mockResolvedValue({ status: 'cancelled' })
}

/** The installed double: one removable layer with two declared rows, one locked. */
const bundleFixtures = [
  {
    name: 'demo-bundle', version: '1.2.3', description: 'A demo bundle', enabled: true,
    installed: true, optional: false, removable: true,
    rows: [
      { rowId: 'demo.row.one', moduleName: '@deepseek-ai/dsh-host-shell', entryId: 'e1' },
      { rowId: 'demo.row.two', moduleName: '@deepseek-ai/dsh-host-files' },
    ],
    overrides: ['base.row'],
  },
  {
    name: 'locked-bundle', enabled: false, installed: true, optional: false, removable: false,
    readOnlyReason: 'management-required', rows: [], overrides: [],
  },
  // The installation ships this one for the person to switch on: the official
  // group's only member, and the other half of the upstream split.
  {
    name: 'shipped-bundle', version: '0.4.0', description: 'A bundle the installation ships',
    enabled: false, installed: false, optional: true, removable: false, rows: [], overrides: [],
  },
  // A built-in profile bundle: filtered out before either group's predicate,
  // exactly as the upstream page filters it.
  {
    name: '@deepseek-ai/dsh-base', enabled: true, installed: true, optional: false, removable: false,
    rows: [], overrides: [],
  },
] as unknown as BundleInfo[]

/** Build the store double the page reads and writes through. */
function makeStore(managementAvailable = true, bundles: readonly BundleInfo[] = bundleFixtures): PluginStore {
  const listeners = new Set<() => void>()
  let state: PluginStoreState = {
    read: {
      status: 'ready',
      snapshot: {
        inventory: { entries: [...inventoryEntries] } as never,
        rows: managerRows as never,
        bundles: bundles as never,
        managementAvailable,
      },
    },
    install: undefined,
  }
  const publish = (): void => { for (const listener of [...listeners]) listener() }
  return {
    refresh: async () => { storeDoubles.refreshes += 1 },
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    setPluginEnabled: (...args) => storeDoubles.setPluginEnabled(...args) as never,
    setBundleEnabled: (...args) => storeDoubles.setBundleEnabled(...args) as never,
    removeBundle: (...args) => storeDoubles.removeBundle(...args) as never,
    openInstall: (spec) => { state = { ...state, install: emptyInstallSession(spec ?? '') }; publish() },
    closeInstall: () => { state = { ...state, install: undefined }; publish() },
    editInstallSpec: (spec) => {
      if (state.install === undefined) return
      state = { ...state, install: { ...state.install, spec } }
      publish()
    },
    inspectInstall: async () => {
      const install = state.install
      if (install === undefined) return
      const answer = await storeDoubles.inspect(install.spec)
      state = {
        ...state,
        install: answer.status === 'refused'
          ? { ...install, phase: 'ready', problem: { problem: answer.problem, reason: answer.reason } }
          : { ...install, phase: 'ready', inspection: answer },
      }
      publish()
    },
    // The double mirrors the real store: a single Install both inspects and
    // installs, so the dialog's one button reproduces the upstream behavior.
    runInstall: async (_approvedBuilds) => {
      const install = state.install
      if (install === undefined) return
      const spec = install.spec.trim()
      if (spec === '' || install.phase === 'checking') return
      if (install.phase === 'installing' || install.phase === 'cancelling' || install.phase === 'applying') return
      state = { ...state, install: { ...install, phase: 'checking', problem: undefined, inspection: undefined, detail: undefined, log: [] } }
      publish()
      const inspection = await storeDoubles.inspect(spec)
      if (inspection.status === 'refused') {
        state = { ...state, install: { ...install, phase: 'ready', problem: { problem: inspection.problem, reason: inspection.reason } } }
        publish()
        return
      }
      state = {
        ...state,
        install: { ...install, phase: 'installing', inspection: inspection as Extract<PluginSpecInspection, { status: 'accepted' }>, pendingBuilds: undefined, detail: undefined, log: [] },
      }
      publish()
      const result = await storeDoubles.installBundle(spec)
      state = {
        ...state,
        install: result.application === 'failed'
          ? { ...state.install!, phase: 'failed', detail: result.error?.diagnostic, pendingBuilds: result.pendingBuilds }
          : { ...state.install!, phase: 'done', bundle: result.bundle },
      }
      publish()
    },
    cancelInstall: async () => {
      const install = state.install
      if (install === undefined) return
      const answer = await storeDoubles.cancelInstall()
      state = {
        ...state,
        install: answer.status === 'cancelled'
          ? { ...install, phase: 'cancelled' }
          : { ...install, phase: 'failed', detail: answer.status },
      }
      publish()
    },
    dispose: () => { listeners.clear() },
  }
}

/** The store the current render reads through (rebuilt per `page()` call). */
let store: PluginStore

/** The official/installed tabs' doubles: an inventory answering two entries (one
 * enabled cloud module, one disabled local path) and a settings resolver that
 * makes the `shell` module configurable. */
const inventoryEntries = [
  { entryId: 'e1', moduleName: '@deepseek-ai/dsh-host-shell', enabled: true, fiberPhase: 'active' },
  { entryId: 'e2', moduleName: './packages/local-plugin', enabled: false, fiberPhase: null },
  // The page only reads and echoes entry ids back, so the doubles skip the
  // Loader's PluginEntryId branding.
] as unknown as readonly PluginInventoryEntry[]

/**
 * The manager's roster for the same two rows: `e1` is addressable through the
 * profile patch, `e2` is not (the deployment protects it), so its switch must
 * render locked rather than offering a write the manager would refuse.
 */
const managerRows = [
  { entryId: 'e1', moduleName: '@deepseek-ai/dsh-host-shell', enabled: true, fiberPhase: 'active', patchId: 'e1' },
  { entryId: 'e2', moduleName: './packages/local-plugin', enabled: false, fiberPhase: null, readOnlyReason: 'management-required' },
]

/**
 * The configuration entries the deployment registers on `plugins.item`: the
 * same host-plane namespaces the upstream Plugins page lists under Official
 * (`Shell`, `Agent loop`, `Subagent`, `Web search`). They carry no switch —
 * they are configuration pages, not bundles.
 */
const itemFixtures: readonly OfficialItem[] = [
  { id: 'bash', label: 'Shell' },
  { id: 'agent-loop', label: 'Agent loop' },
  { id: 'subagent', label: 'Subagent' },
  { id: 'web-search', label: 'Web search' },
]

/** One configuration entry's own one-liner, keyed by its registration id. */
const itemSummaries: Readonly<Record<string, string>> = {
  bash: 'Configure the shell the agent runs commands in.',
  'agent-loop': 'Configure how the agent loops.',
  subagent: 'Configure subagents.',
  'web-search': 'Configure the web search provider.',
}

function page(options: {
  managementAvailable?: boolean
  bundles?: readonly BundleInfo[]
  items?: readonly OfficialItem[]
} = {}) {
  store = makeStore(options.managementAvailable ?? true, options.bundles ?? bundleFixtures)
  const items = options.items ?? itemFixtures
  return render(
    <MarketsPage
      {...standard}
      mode="markets"
      t={t}
      dispatchPrompt={dispatchPrompt}
      store={store}
      settingsTarget={row => (
        row.name.toLocaleLowerCase().endsWith('shell')
          ? { configurable: true, namespace: 'shell' }
          : { configurable: false }
      )}
      onConfigure={onConfigure}
      items={items}
      // The child seat's render face: the page asks for each configuration
      // entry's own `summary` view, exactly as the real props face does.
      renderSlot={(_slot, _params, options) => itemSummaries[(options as { only?: string }).only ?? '']}
    />,
  )
}

/** Click one row's switch by its accessible name. */
function clickRowSwitch(view: ReturnType<typeof page>, name: string): void {
  fireEvent.click(view.getByRole('switch', { name }))
}

/** Click one category tab by its verbatim key. */
function clickTab(view: ReturnType<typeof page>, name: string): void {
  const tab = Array.from(view.getByRole('tablist', { name: 'tabs.label' }).querySelectorAll('[role="tab"]'))
    .find(candidate => candidate.textContent === name) as HTMLElement
  fireEvent.click(tab)
}

/** Click one Plugins sub-tab chip by its data-plugin-subtab id. */
function clickPluginSubTab(view: ReturnType<typeof page>, id: 'cloud' | 'official' | 'installed'): void {
  const chip = view.container.querySelector(`[data-plugin-subtab="${id}"]`) as HTMLElement
  fireEvent.click(chip)
}

/** Wait for the official tab's bundle groups, whose cards render immediately. */
async function awaitBundleGroups(view: ReturnType<typeof page>): Promise<void> {
  await waitFor(() => {
    expect(view.container.querySelector('[data-bundle-group]')).not.toBeNull()
  })
}

/** The bundle cards of one group, in render order. */
function bundleCardsOf(view: ReturnType<typeof page>, group: 'official' | 'bundles'): HTMLElement[] {
  return Array.from(view.container.querySelectorAll<HTMLElement>(
    `[data-bundle-group="${group}"] [data-bundle]`,
  ))
}

/** The row switches of the installed tab's roster (bundle cards carry their own). */
function rowSwitches(view: ReturnType<typeof page>): HTMLElement[] {
  return Array.from(view.container.querySelectorAll<HTMLElement>('[data-plugin-module] [role="switch"]'))
}

/** The row whose module specifier ends with the given tail. */
function rowOf(view: ReturnType<typeof page>, tail: string): HTMLElement {
  const row = Array.from(view.container.querySelectorAll<HTMLElement>('[data-plugin-module]'))
    .find(candidate => candidate.getAttribute('data-plugin-module')?.endsWith(tail))
  if (row === undefined) throw new Error(`no roster row matching ${tail}`)
  return row
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
      .toEqual(['cloud', 'official', 'installed'])
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

  it('renders the official plugin roster from this application inventory', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    // The installed sub-tab is a view over the running application, not a
    // market page; the cloud chip's embedded surface leaves the panel.
    await waitFor(() => {
      expect(view.container.querySelector('[data-official-scope="installed"]')).not.toBeNull()
    })
    expect(view.container.querySelector('[data-markets-app-plugins]')).toBeNull()
    // The header search placeholder narrows to the official scope.
    const search = view.getByRole('searchbox', { name: 'search.installed' })
    expect(search.getAttribute('placeholder')).toBe('search.installed')
    // The enabled inventory entry is listed, tagged by origin and enablement.
    // The origin axis still reads local/cloud: it names where the module came
    // from, which is a different question from the tab's scope.
    const rows = Array.from(view.container.querySelectorAll('[data-plugin-module]'))
    expect(rows.map(row => row.getAttribute('data-plugin-origin'))).toEqual(['cloud'])
    expect(rows.map(row => row.getAttribute('data-enabled'))).toEqual(['true'])
    // This tab is a roster, so no bundle cards ride along.
    expect(view.container.querySelector('[data-bundle]')).toBeNull()
  })

  it('renders only enabled plugins on the installed sub-tab', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.container.querySelector('[data-official-scope="installed"]')).not.toBeNull()
    })
    const rows = Array.from(view.container.querySelectorAll('[data-plugin-module]'))
    // The disabled entry is filtered out of the installed set.
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

  it('renders an enable switch on every roster row, checked from the live tree', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.container.querySelector('[data-official-scope="installed"]')).not.toBeNull()
    })
    const switches = rowSwitches(view)
    expect(switches).toHaveLength(1)
    // The switch reads the live tree's own enablement. The accessible name
    // names the action the click would take, and addresses the row by its own
    // shortened module specifier — so the assertion reads the row directly
    // instead of trusting the roster's ordering.
    const shellSwitch = rowOf(view, 'dsh-host-shell').querySelector('[role="switch"]') as HTMLElement
    expect(shellSwitch.getAttribute('aria-checked')).toBe('true')
    expect(shellSwitch.getAttribute('aria-label')).toBe(spelled('official.toggle.disable', 'shell'))
  })

  it('locks the switch of a row the manager cannot address, saying why', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.container.querySelector('[data-official-scope="installed"]')).not.toBeNull()
    })
    const shellSwitch = rowOf(view, 'dsh-host-shell').querySelector('[role="switch"]') as HTMLButtonElement
    expect(shellSwitch.disabled).toBe(false)
    // The protected row is filtered out of this tab (it is disabled), and the
    // official tab is card-granular now, so a locked row is only reachable
    // through the card that declares it — the bundle cards assert their own
    // lock above.
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.container.querySelector('[data-bundle-group]')).not.toBeNull()
    })
    const lockedBundleSwitch = view.container
      .querySelector('[data-bundle="locked-bundle"] [role="switch"]') as HTMLButtonElement
    expect(lockedBundleSwitch.disabled).toBe(true)
    expect(lockedBundleSwitch.getAttribute('title')).toBe('bundles.locked.management')
  })

  it('writes a row enablement through the manager and re-reads the roster', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(rowSwitches(view)).toHaveLength(1)
    })
    clickRowSwitch(view, spelled('official.toggle.disable', 'shell'))
    // The write addresses the row's Loader entry id, not its display name.
    await waitFor(() => {
      expect(storeDoubles.setPluginEnabled).toHaveBeenCalledWith('e1', false)
    })
    // A settled apply leaves no outcome line behind.
    await waitFor(() => {
      expect(view.container.querySelector('[data-write-status]')).toBeNull()
    })
  })

  it('reports a restart-required write instead of flipping the switch locally', async () => {
    storeDoubles.setPluginEnabled.mockResolvedValue(
      { changed: true, application: 'restart-required', stage: 'enable', target: 'e1' })
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(rowSwitches(view)).toHaveLength(1)
    })
    clickRowSwitch(view, spelled('official.toggle.disable', 'shell'))
    await waitFor(() => {
      expect(view.container.querySelector('[data-write-status="restart"]')).not.toBeNull()
    })
    // The switch still shows the live tree's state; the panel never pretends
    // the change landed just because the write was accepted.
    expect(rowSwitches(view)[0]!.getAttribute('aria-checked')).toBe('true')
  })

  it('reports a failed write when the manager call rejects', async () => {
    storeDoubles.setPluginEnabled.mockRejectedValue(new Error('transport down'))
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(rowSwitches(view)).toHaveLength(1)
    })
    clickRowSwitch(view, spelled('official.toggle.disable', 'shell'))
    await waitFor(() => {
      expect(view.container.querySelector('[data-write-status="failed"]')).not.toBeNull()
    })
  })

  it('never writes a bundle whose switch is locked', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    // The locked bundle's switch refuses the click outright.
    fireEvent.click(view.container
      .querySelector('[data-bundle="locked-bundle"] [role="switch"]') as HTMLElement)
    expect(storeDoubles.setBundleEnabled).not.toHaveBeenCalled()
  })

  it('kicks the roster off the running tree when the installed tab renders it', async () => {
    const view = page()
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.container.querySelector('[data-official-scope="installed"]')).not.toBeNull()
    })
    // The installed view filters to the live tree's enabled entries, and the
    // surviving row still carries a switch.
    const rows = Array.from(view.container.querySelectorAll('[data-plugin-module]'))
    expect(rows).toHaveLength(1)
    expect(view.getAllByRole('switch')).toHaveLength(1)
    expect(view.getAllByRole('switch')[0]!.getAttribute('aria-checked')).toBe('true')
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
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.container.querySelector('[data-official-scope="official"]')).not.toBeNull()
    })
    expect(view.container.querySelector('[data-markets-tab="plugins"]')!.getAttribute('data-plugins-subtab'))
      .toBe('official')
    // Back to cloud restores the appstore surface.
    clickPluginSubTab(view, 'cloud')
    await waitFor(() => {
      expect(view.getByTestId('markets-app-plugins')).toBeTruthy()
    })
    expect(view.container.querySelector('[data-official-scope]')).toBeNull()
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

  it('splits the official tab into the official and installed bundle groups', async () => {
    const view = page()
    // The cloud sub-tab is a store view, so no bundle group at all.
    expect(view.container.querySelector('[data-bundle-group]')).toBeNull()
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.container.querySelector('[data-bundle-group]')).not.toBeNull()
    })
    // The two groups follow the upstream predicates: `optional && !installed`
    // is official, `installed || !optional` is installed. The built-in profile
    // bundle is filtered out before either runs, so it is in neither.
    expect(Array.from(view.container.querySelectorAll('[data-bundle-group]'))
      .map(group => group.getAttribute('data-bundle-group')))
      .toEqual(['official', 'bundles'])
    expect(bundleCardsOf(view, 'official').map(card => card.getAttribute('data-bundle')))
      .toEqual(['shipped-bundle'])
    expect(bundleCardsOf(view, 'bundles').map(card => card.getAttribute('data-bundle')))
      .toEqual(['demo-bundle', 'locked-bundle'])
    expect(view.container.querySelector('[data-bundle="@deepseek-ai/dsh-base"]')).toBeNull()
    // The heading carries the group's own count, not the surface total.
    expect(view.container.querySelector('[data-bundle-group="official"] [data-bundle-group-count]')
      ?.getAttribute('data-bundle-group-count') ?? '1').toBe('1')
    expect(view.container.querySelector('[data-bundle-group="bundles"]')
      ?.getAttribute('data-bundle-group-count')).toBe('2')

    const cards = bundleCardsOf(view, 'bundles')
    // Each card's declared rows start folded; the count tag discloses them.
    expect(cards[0]!.querySelectorAll('[data-bundle-row]')).toHaveLength(0)
    expect(cards[0]!.getAttribute('data-bundle-rows-expanded')).toBe('false')
    expect(cards[0]!.getAttribute('data-removable')).toBe('true')
    expect(cards[1]!.getAttribute('data-removable')).toBe('false')
    expect(cards[1]!.getAttribute('data-bundle-locked')).toBe('true')

    // The installed sub-tab drops the bundle groups: it lists entries in force.
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.container.querySelector('[data-official-scope="installed"]')).not.toBeNull()
    })
    expect(view.container.querySelector('[data-bundle-group]')).toBeNull()
  })

  it('renders an official bundle as the upstream card: icon, name, one-liner', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    const card = view.container.querySelector('[data-bundle="shipped-bundle"]') as HTMLElement
    // The pinwheel in its framed box is what makes the card read as a plugin,
    // not as a row: it is the upstream card's leading element.
    const icon = card.querySelector('span[aria-hidden="true"] svg')
    expect(icon).not.toBeNull()
    expect(icon!.getAttribute('width')).toBe('20')
    // A bundle with copy of its own shows the localized name and one-liner,
    // never the raw npm specifier and never the English manifest sentence.
    expect(card.textContent).toContain('shipped-bundle')
    expect(card.textContent).toContain('A bundle the installation ships')
    expect(card.textContent).not.toContain('@deepseek-ai/')
  })

  it('localizes an official package that carries copy of its own', async () => {
    // The two experimental bundles are the real packages the surface meets, so
    // they exercise the BUILTIN_COPY path rather than the short-name fallback.
    const view = page({
      bundles: [
        ...bundleFixtures,
        {
          name: '@deepseek-ai/dsh-experimental-agent-team-profile',
          version: '0.1.6', description: 'Experimental profile bundle enabling Agent Teams over dsh-base',
          enabled: true, installed: false, optional: true, removable: false, rows: [], overrides: [],
        },
      ] as never,
    })
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    const card = view.container
      .querySelector('[data-bundle="@deepseek-ai/dsh-experimental-agent-team-profile"]') as HTMLElement
    // The locale seat renders keys verbatim, so the card's copy is the key.
    expect(card.textContent).toContain('official.bundle.agentTeam.title')
    expect(card.textContent).toContain('official.bundle.agentTeam.description')
    expect(card.textContent).toContain('official.bundle.beta')
    // The raw npm name survives only as the card's tooltip, never as its label,
    // and the manifest's English sentence is gone entirely.
    expect(card.querySelector('strong')!.textContent).toBe('official.bundle.agentTeam.title')
    expect(card.querySelector('strong')!.getAttribute('title'))
      .toBe('@deepseek-ai/dsh-experimental-agent-team-profile')
    expect(card.textContent).not.toContain('Experimental profile bundle enabling Agent Teams over dsh-base')
  })

  it('lists the plugins that carry their own configuration beside the official bundles', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    // The upstream Official group is the union of two sources: the bundles
    // the installation ships for the person to switch on (`optional &&
    // !installed`) and the plugins that registered a configuration page of
    // their own. The second kind carries no switch — it is a configuration
    // entry, not a bundle — but it belongs on the page, because that is where
    // a person looks for it. Their order is the registrants' declared order.
    const officialGroup = view.container.querySelector('[data-bundle-group="official"]') as HTMLElement
    expect(Array.from(officialGroup.querySelectorAll('[data-plugin-item]'))
      .map(card => card.getAttribute('data-plugin-item')))
      .toEqual(['bash', 'agent-loop', 'subagent', 'web-search'])
    // Each card shows the registrant's localized title and its own one-liner.
    const cards = Array.from(officialGroup.querySelectorAll('[data-plugin-item]')) as HTMLElement[]
    expect(cards.map(card => card.querySelector('strong')!.textContent))
      .toEqual(['Shell', 'Agent loop', 'Subagent', 'Web search'])
    expect(cards[0]!.textContent).toContain('Configure the shell the agent runs commands in.')
    // The pinwheel marks them as plugins exactly as it does the bundles.
    expect(cards[0]!.querySelector('span[aria-hidden="true"] svg')).not.toBeNull()

    // No switch, no uninstall: a host-plane configuration page has no
    // enablement to flip and no dependency to remove.
    for (const card of cards) {
      expect(card.querySelector('[role="switch"]')).toBeNull()
      expect(card.querySelector('[data-bundle-uninstall]')).toBeNull()
      expect(card.querySelector('[data-bundle]')).toBeNull()
    }

    // The heading count is the group's whole membership: bundles + entries.
    expect(officialGroup.getAttribute('data-bundle-group-count')).toBe('5')
  })

  it('keeps the configuration entries out of the installed group', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    // Only the Official group is the union: the installed group lists the
    // bundles in force, and a configuration entry is not one of them.
    const installedGroup = view.container.querySelector('[data-bundle-group="bundles"]') as HTMLElement
    expect(installedGroup.querySelector('[data-plugin-item]')).toBeNull()
  })

  it('drops the configuration cards when the search does not match them', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    const search = view.getByRole('searchbox', { name: 'search.official' }) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'web-search' } })
    await waitFor(() => {
      expect(view.container.querySelector('[data-plugin-item="bash"]')).toBeNull()
    })
    // The match survives on either the localized title or the registration id.
    expect(view.container.querySelector('[data-plugin-item="web-search"]')).not.toBeNull()
  })

  it('keeps the official tab card-granular, with rows only inside a card', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    // The tab's top level is cards: a declared row is nowhere until its own
    // card's count tag is opened, so no flattened roster sits beside them.
    expect(view.container.querySelector('[data-plugin-module]')).toBeNull()
    const card = view.container.querySelector('[data-bundle="demo-bundle"]') as HTMLElement
    expect(card.getAttribute('data-bundle-rows-expanded')).toBe('false')
    expect(card.querySelector('[data-bundle-row]')).toBeNull()

    // The installed tab is the roster of entries in force, so it keeps the
    // flat list — and drops the bundle cards, which belong to the official
    // question rather than to "what is in force now".
    clickPluginSubTab(view, 'installed')
    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-plugin-module]').length).toBeGreaterThan(0)
    })
    expect(view.container.querySelector('[data-bundle]')).toBeNull()
  })

  it('folds the bundle rows until their count tag is opened', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    const card = view.container.querySelector('[data-bundle="demo-bundle"]') as HTMLElement
    expect(card.getAttribute('data-bundle-rows-expanded')).toBe('false')
    expect(card.querySelector('[data-bundle-row]')).toBeNull()

    // The count tag discloses that card's rows, and only that card's.
    const rowsToggle = view.container
      .querySelector('[data-bundle-rows-toggle="demo-bundle"]') as HTMLElement
    expect(rowsToggle.getAttribute('aria-expanded')).toBe('false')
    expect(rowsToggle.textContent).toBe(spelled('bundles.rows', '2'))
    fireEvent.click(rowsToggle)
    expect(rowsToggle.getAttribute('aria-expanded')).toBe('true')
    expect(card.getAttribute('data-bundle-rows-expanded')).toBe('true')
    await waitFor(() => {
      expect(card.querySelectorAll('[data-bundle-row]')).toHaveLength(2)
    })
    expect(view.container.querySelector('[data-bundle="locked-bundle"] [data-bundle-row]')).toBeNull()
  })

  it('writes a bundle enablement and reads the bundle switch from the live tree', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    const bundleSwitch = view.container
      .querySelector('[data-bundle="demo-bundle"] [role="switch"]') as HTMLElement
    expect(bundleSwitch.getAttribute('aria-checked')).toBe('true')
    expect(bundleSwitch.getAttribute('aria-label')).toBe(spelled('bundles.toggle.disable', 'demo-bundle'))
    fireEvent.click(bundleSwitch)
    await waitFor(() => {
      expect(storeDoubles.setBundleEnabled).toHaveBeenCalledWith('demo-bundle', false)
    })
  })

  it('locks a bundle the deployment protects and refuses its write', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    const lockedSwitch = view.container
      .querySelector('[data-bundle="locked-bundle"] [role="switch"]') as HTMLButtonElement
    expect(lockedSwitch.disabled).toBe(true)
    expect(lockedSwitch.getAttribute('title')).toBe('bundles.locked.management')
    fireEvent.click(lockedSwitch)
    expect(storeDoubles.setBundleEnabled).not.toHaveBeenCalled()
  })

  it('uninstalls a removable bundle after the confirmation, and no other', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await awaitBundleGroups(view)
    // The locked bundle cannot be uninstalled, and the installation-supplied
    // rule is the Host's: `removable` is the only thing this panel reads.
    const lockedUninstall = view.container
      .querySelector('[data-bundle="locked-bundle"] [data-bundle-uninstall]') as HTMLButtonElement
    expect(lockedUninstall.disabled).toBe(true)

    fireEvent.click(view.container.querySelector('[data-bundle="demo-bundle"] [data-bundle-uninstall]') as HTMLElement)
    await waitFor(() => {
      expect(storeDoubles.removeBundle).toHaveBeenCalledWith('demo-bundle')
    })
  })

  it('opens the install dialog from the panel head and keeps Install inert until a spec is typed', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-markets-install-open]')).not.toBeNull()
    })
    fireEvent.click(view.baseElement.querySelector('[data-markets-install-open]') as HTMLElement)
    expect(view.getByRole('dialog', { name: 'install.title' })).not.toBeNull()
    // The single Install action stays inert until the field holds a spec; it
    // neither inspects nor installs on its own.
    expect((view.baseElement.querySelector('[data-install-submit]') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(view.getByRole('textbox', { name: 'install.spec' }), { target: { value: '@scope/demo' } })
    expect((view.baseElement.querySelector('[data-install-submit]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('surfaces an inspection refusal with the Host reason instead of installing', async () => {
    storeDoubles.inspect.mockResolvedValue({ status: 'refused', problem: 'already-installed', reason: 'already there' })
    const view = page()
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-markets-install-open]')).not.toBeNull()
    })
    fireEvent.click(view.baseElement.querySelector('[data-markets-install-open]') as HTMLElement)
    fireEvent.change(view.getByRole('textbox', { name: 'install.spec' }), { target: { value: 'demo-plugin' } })
    // The single Install action inspects implicitly, so a refusal returns to the field.
    fireEvent.click(view.baseElement.querySelector('[data-install-submit]') as HTMLElement)
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-install-problem="already-installed"]')).not.toBeNull()
    })
    expect(view.getByText('already there')).not.toBeNull()
    expect(storeDoubles.installBundle).not.toHaveBeenCalled()
  })

  it('runs the install, streams its phase, and reports the settled bundle', async () => {
    const view = page()
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-markets-install-open]')).not.toBeNull()
    })
    fireEvent.click(view.baseElement.querySelector('[data-markets-install-open]') as HTMLElement)
    fireEvent.change(view.getByRole('textbox', { name: 'install.spec' }), { target: { value: '@scope/demo' } })
    fireEvent.click(view.baseElement.querySelector('[data-install-submit]') as HTMLElement)
    await waitFor(() => {
      expect(storeDoubles.installBundle).toHaveBeenCalledWith('@scope/demo')
    })
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-install-done]')).not.toBeNull()
    })
    expect(view.baseElement.querySelector('[data-install-done]')!.textContent)
      .toBe(spelled('install.done.known', 'demo-plugin'))
  })

  it('offers approval-and-retry when a failed run left install scripts pending', async () => {
    storeDoubles.installBundle.mockResolvedValue({
      changed: false, application: 'failed', stage: 'install', target: 'demo-plugin',
      error: { code: 'operation-error', diagnostic: 'build scripts blocked' },
      pendingBuilds: ['esbuild', 'sharp'],
    })
    const view = page()
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-markets-install-open]')).not.toBeNull()
    })
    fireEvent.click(view.baseElement.querySelector('[data-markets-install-open]') as HTMLElement)
    fireEvent.change(view.getByRole('textbox', { name: 'install.spec' }), { target: { value: 'demo-plugin' } })
    fireEvent.click(view.baseElement.querySelector('[data-install-submit]') as HTMLElement)
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-install-approval]')).not.toBeNull()
    })
    // The pending names are the Host's own, listed verbatim.
    const approval = view.baseElement.querySelector('[data-install-approval]')!
    expect(approval.textContent).toContain('esbuild')
    expect(approval.textContent).toContain('sharp')
    // The plain submit yields to the approval action, which retries with them.
    expect(view.baseElement.querySelector('[data-install-submit]')).toBeNull()
    storeDoubles.installBundle.mockClear()
    fireEvent.click(view.baseElement.querySelector('[data-install-approve]') as HTMLElement)
    await waitFor(() => {
      expect(storeDoubles.installBundle).toHaveBeenCalledWith('demo-plugin')
    })
  })

  it('cancels a run in flight and reports the Host cancellation answer', async () => {
    // Hold the install open so the cancel button is reachable mid-run.
    let release: (() => void) | undefined
    storeDoubles.installBundle.mockImplementation(() => new Promise((resolve) => {
      release = () => { resolve({ changed: true, application: 'applied', stage: 'enable', target: 'demo-plugin', bundle: 'demo-plugin' }) }
    }))
    const view = page()
    clickPluginSubTab(view, 'official')
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-markets-install-open]')).not.toBeNull()
    })
    fireEvent.click(view.baseElement.querySelector('[data-markets-install-open]') as HTMLElement)
    fireEvent.change(view.getByRole('textbox', { name: 'install.spec' }), { target: { value: 'demo-plugin' } })
    fireEvent.click(view.baseElement.querySelector('[data-install-submit]') as HTMLElement)
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-install-phase="installing"]')).not.toBeNull()
    })
    fireEvent.click(view.baseElement.querySelector('[data-install-cancel]') as HTMLElement)
    await waitFor(() => {
      expect(storeDoubles.cancelInstall).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(view.baseElement.querySelector('[data-install-cancelled]')).not.toBeNull()
    })
    release?.()
  })

  it('hides the install trigger and locks the switches when the deployment exposes no management', async () => {
    // A store whose read says this deployment manages no profile: every write
    // affordance must lock rather than offer a call the Host would refuse.
    const viewed = page({ managementAvailable: false })
    clickPluginSubTab(viewed, 'official')
    await awaitBundleGroups(viewed)
    expect(viewed.container.querySelector('[data-markets-install-open]')).toBeNull()
    const bundleSwitch = viewed.container
      .querySelector('[data-bundle="demo-bundle"] [role="switch"]') as HTMLButtonElement
    expect(bundleSwitch.disabled).toBe(true)
    expect(bundleSwitch.getAttribute('title')).toBe('official.write.unavailable')
    fireEvent.click(bundleSwitch)
    expect(storeDoubles.setBundleEnabled).not.toHaveBeenCalled()
  })
})
