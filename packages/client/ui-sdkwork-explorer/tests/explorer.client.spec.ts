/**
 * ui-sdkwork-explorer plugin halves: dictionary parity, the node half's
 * settings-namespace registration, and the gesture-bus routing (builtin /
 * native / ask) against the real SlotRegistry with stub right-Sidebar,
 * settings, workspace, and remote services.
 */
// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { act } from 'react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import {
  apply, EXPLORER_OPEN_FILE_EVENT, EXPLORER_OPEN_URL_EVENT, inject,
  routeOpen, type ExplorerOpenFileDetail, type ExplorerOpenUrlDetail,
} from '../src/client/index.ts'
import { EXPLORER_SETTINGS_NAMESPACE, type ExplorerSettings } from '../src/explorer-settings.ts'
import { apply as applyNode } from '../src/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { TabStore, tabTitle } from '../src/client/tabs.ts'

/** Dispatch one file gesture; @returns whether the explorer claimed it. */
function dispatchFile(detail: ExplorerOpenFileDetail): boolean {
  return !document.dispatchEvent(new CustomEvent(EXPLORER_OPEN_FILE_EVENT, { cancelable: true, detail }))
}

/** Dispatch one link gesture; @returns whether the explorer claimed it. */
function dispatchUrl(detail: ExplorerOpenUrlDetail): boolean {
  return !document.dispatchEvent(new CustomEvent(EXPLORER_OPEN_URL_EVENT, { cancelable: true, detail }))
}

/** Stub face of the right-Sidebar controller, as recording mocks. */
interface StubSidebarRight {
  openTab: ReturnType<typeof vi.fn>
  isExpanded: ReturnType<typeof vi.fn>
  toggleExpanded: ReturnType<typeof vi.fn>
}

/** Boot the browser half over a real slot tree declaring the sidebar tab seat. */
async function bench(settings: ExplorerSettings | undefined): Promise<{
  ctx: Context
  sidebarRight: StubSidebarRight
  openedPaths: string[]
  host: ReturnType<typeof stubSettingsScope<ExplorerSettings>>
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
      'settings.section': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)

  const sidebarRight: StubSidebarRight = {
    openTab: vi.fn(),
    isExpanded: vi.fn(() => true),
    toggleExpanded: vi.fn(),
  }
  ctx.provide('sidebarRight', sidebarRight)
  ctx.provide('sidebarRightTabs', { register: vi.fn(() => () => {}) })

  const host = stubSettingsScope<ExplorerSettings>()
  if (settings !== undefined) {
    host.publish({ status: 'ready', value: settings, revision: 1, writable: true })
  }
  ctx.provide('settingsScope', { bind: () => host.scope })

  ctx.provide('uiWorkspace', {
    readTextFile: vi.fn(async (path: string) => `// ${path}\nconst a = 1\n`),
  } as never)

  const openedPaths: string[] = []
  const sessionNamespace = {
    openWorkspacePath: vi.fn(async (request: { path: string }) => {
      openedPaths.push(request.path)
      return { ok: true as const, value: undefined }
    }),
  }
  // Cordis resolves inject names VERBATIM: the dotted key must be provided as
  // a literal service, not nested under `remote` (deploy-spec convention).
  ctx.provide('remote', { session: sessionNamespace } as never)
  ctx.provide('remote.session', sessionNamespace as never)

  // The locale service backs the plugin's dictionary registration and its
  // `t` seat (deploy-spec convention: boot the real locale plugin).
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()

  const fiber = ctx.plugin({ apply, inject, name: 'ui-sdkwork-explorer' })
  await fiber.await()
  // The gesture listeners live on the shared jsdom document; disposing the
  // fiber per test keeps specs independent.
  onTestFinished(async () => { await fiber.dispose() })
  return { ctx, sidebarRight, openedPaths, host }
}

describe('explorer locales', () => {
  it('keeps the English dictionary key-identical to the Chinese source', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(NS).toBe('explorer')
  })
})

describe('explorer node half', () => {
  it('registers the durable settings namespace when a provider exists', async () => {
    const ctx = new Context()
    const register = vi.fn()
    ctx.provide('settings', { register })
    applyNode(ctx)
    // ctx.inject resolves its dependency fiber asynchronously.
    await vi.waitFor(() => {
      expect(register).toHaveBeenCalledWith(EXPLORER_SETTINGS_NAMESPACE, expect.anything())
    })
  })
})

describe('explorer gesture routing', () => {
  it('claims file gestures in the default builtin mode: tab + sidebar column', async () => {
    const { ctx, sidebarRight } = await bench(undefined)
    const service = ctx.sdkworkExplorer

    const claimed = dispatchFile({ path: 'E:/w/src/app.ts', cwd: 'E:/w' })

    expect(claimed).toBe(true)
    expect(sidebarRight.openTab).toHaveBeenCalledWith('sdkwork-explorer')
    const snap = service.tabs.getSnapshot()
    expect(snap.tabs).toHaveLength(1)
    expect(snap.tabs[0]).toMatchObject({ kind: 'file', path: 'E:/w/src/app.ts', title: 'app.ts' })
    expect(snap.activeId).toBe(snap.tabs[0]?.id)
    // The explorer's body registers once under its type id, before any claim.
    const entries = ctx.slots.entries('sidebar.right.pane.tab')
    expect(entries).toHaveLength(1)
    // Registered once even across further opens.
    dispatchFile({ path: 'E:/w/src/app.ts', cwd: 'E:/w' })
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(1)
    expect(service.tabs.getSnapshot().tabs).toHaveLength(1)
  })

  it('passes file gestures through and still claims links per kind', async () => {
    const { ctx, openedPaths } = await bench({ fileOpen: 'native', linkOpen: 'builtin' })

    const fileClaimed = dispatchFile({ path: 'E:/w/readme.md' })
    expect(fileClaimed).toBe(false)
    expect(openedPaths).toEqual([]) // the historical native opener runs in the caller
    expect(ctx.sdkworkExplorer.tabs.getSnapshot().tabs).toHaveLength(0)

    const linkClaimed = dispatchUrl({ url: 'https://example.com/docs' })
    expect(linkClaimed).toBe(true)
    expect(ctx.sdkworkExplorer.tabs.getSnapshot().tabs[0]).toMatchObject({
      kind: 'web', url: 'https://example.com/docs', title: 'example.com',
    })
  })

  it('shows the ask-chooser in ask mode and opens the builtin tab on pick', async () => {
    const { ctx, sidebarRight } = await bench({ fileOpen: 'ask', linkOpen: 'ask' })

    const claimed = await act(async () => dispatchFile({ path: 'E:/w/src/main.go', cwd: 'E:/w', x: 400, y: 300 }))
    expect(claimed).toBe(true)
    const chooser = document.querySelector('[data-explorer-chooser]')
    expect(chooser).not.toBeNull()
    expect(ctx.sdkworkExplorer.tabs.getSnapshot().tabs).toHaveLength(0)

    const builtinButton = chooser?.querySelectorAll('button')[0]
    expect(builtinButton).toBeDefined()
    await act(async () => { builtinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(document.querySelector('[data-explorer-chooser]')).toBeNull()
    const snap = ctx.sdkworkExplorer.tabs.getSnapshot()
    expect(snap.tabs[0]).toMatchObject({ kind: 'file', path: 'E:/w/src/main.go' })
    expect(sidebarRight.openTab).toHaveBeenCalledWith('sdkwork-explorer')
  })

  it('ignores malformed gestures and non-http protocols', async () => {
    const { ctx } = await bench(undefined)
    expect(dispatchFile({ path: '' })).toBe(false)
    expect(dispatchUrl({ url: 'javascript:alert(1)' })).toBe(false)
    expect(dispatchUrl({ url: 'not a url' })).toBe(false)
    expect(ctx.sdkworkExplorer.tabs.getSnapshot().tabs).toHaveLength(0)
  })

  it('keeps the tab type registered when the last tab closes', async () => {
    const { ctx } = await bench(undefined)
    const service = ctx.sdkworkExplorer
    dispatchFile({ path: 'E:/w/a.ts' })
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(1)
    service.closeTab(service.tabs.getSnapshot().activeId ?? '')
    expect(service.tabs.getSnapshot().tabs).toHaveLength(0)
    // Upstream's model is persistent tab types: the registration survives the
    // empty strip, and the next claim reopens the page.
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(1)
  })
})

describe('TabStore', () => {
  it('deduplicates by content identity and activates the existing tab', () => {
    const store = new TabStore()
    const first = store.open({ kind: 'file', path: '/a.ts', title: 'a.ts' })
    const again = store.open({ kind: 'file', path: '/a.ts', title: 'a.ts' })
    expect(again.id).toBe(first.id)
    expect(store.getSnapshot().tabs).toHaveLength(1)
    const web = store.open({ kind: 'web', url: 'https://x.dev', title: 'x.dev' })
    expect(store.getSnapshot().activeId).toBe(web.id)
    store.activate(first.id)
    expect(store.getSnapshot().activeId).toBe(first.id)
  })

  it('activates the left neighbor when the active tab closes', () => {
    const store = new TabStore()
    const a = store.open({ kind: 'file', path: '/a.ts', title: 'a.ts' })
    const b = store.open({ kind: 'file', path: '/b.ts', title: 'b.ts' })
    const c = store.open({ kind: 'file', path: '/c.ts', title: 'c.ts' })
    store.close(c.id)
    expect(store.getSnapshot().activeId).toBe(b.id)
    store.close(b.id)
    expect(store.getSnapshot().activeId).toBe(a.id)
    store.close(a.id)
    expect(store.getSnapshot().activeId).toBeUndefined()
  })

  it('derives strip titles from basenames and URL hosts', () => {
    expect(tabTitle({ kind: 'file', path: 'E:/w/src/app.model.ts' })).toBe('app.model.ts')
    expect(tabTitle({ kind: 'file', path: '/unix/path/README.md' })).toBe('README.md')
    expect(tabTitle({ kind: 'web', url: 'https://docs.example.com/x?q=1' })).toBe('docs.example.com')
  })
})

describe('routeOpen', () => {
  it('maps modes to gesture decisions', () => {
    expect(routeOpen('builtin')).toBe('tab')
    expect(routeOpen('ask')).toBe('chooser')
    expect(routeOpen('native')).toBe('pass')
  })
})
