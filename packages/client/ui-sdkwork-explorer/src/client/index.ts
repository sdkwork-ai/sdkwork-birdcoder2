/**
 * SDKWork explorer plugin, browser half.
 *
 * Claims conversation file/link gestures over the cross-bundle DOM bus (see
 * ./bus.ts), opening files as read-only editor tabs, applied changes as diff
 * preview tabs, and links as embedded browser tabs in the VSCode-style
 * explorer tab of the right Sidebar (the `sdkwork-explorer` page type). Open
 * modes (built-in pane / system app / ask every time) persist through the
 * Host settings document and are editable in the settings center; the diff
 * preview is inherently built-in and always claims.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import {
  EXPLORER_OPEN_DIFF_EVENT, EXPLORER_OPEN_FILE_EVENT, EXPLORER_OPEN_URL_EVENT,
  isDiffHunks,
  type ExplorerOpenDiffDetail, type ExplorerOpenFileDetail, type ExplorerOpenUrlDetail,
} from './bus.ts'
import { EXPLORER_ID, EXPLORER_KIND, explorerDefinition } from './definition.ts'
import { ExplorerPanel } from './ExplorerPanel.tsx'
import {
  EXPLORER_SETTINGS_NAMESPACE, type ExplorerOpenMode, type ExplorerSettings,
} from '../explorer-settings.ts'
import { en, NS, zh, type ExplorerKey } from './locales.ts'
import { OpenModePolicy, routeOpen } from './policy.ts'
import { ExplorerSettingsSection } from './SettingsSection.tsx'
import { SdkworkExplorerService } from './service.ts'

export { EXPLORER_OPEN_DIFF_EVENT, EXPLORER_OPEN_FILE_EVENT, EXPLORER_OPEN_URL_EVENT, isDiffHunks } from './bus.ts'
export type { ExplorerOpenDiffDetail, ExplorerOpenFileDetail, ExplorerOpenUrlDetail } from './bus.ts'
export { EXPLORER_ID, EXPLORER_KIND, explorerDefinition } from './definition.ts'
export { ExplorerPanel } from './ExplorerPanel.tsx'
export { ExplorerSettingsSection } from './SettingsSection.tsx'
export { OpenModePolicy, routeOpen } from './policy.ts'
export { SdkworkExplorerService } from './service.ts'
export { TabStore, tabTitle, type ExplorerTab, type ExplorerTabsSnapshot } from './tabs.ts'
export {
  EXPLORER_SETTINGS_NAMESPACE, FILE_OPEN_FIELD, LINK_OPEN_FIELD, OPEN_MODES,
  type ExplorerOpenMode, type ExplorerSettings,
} from '../explorer-settings.ts'
export { en, NS, zh, type ExplorerKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork explorer plugin copy. */
    explorer: ExplorerKey
  }
}

/**
 * The explorer service sibling surfaces can use to open tabs directly
 * (bypassing the DOM gesture bus); absent when this plugin is not loaded.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork explorer service; absent when this plugin is not loaded. */
    sdkworkExplorer: SdkworkExplorerService
  }
}

/** Services required by the explorer's gesture bus, sidebar tab, and settings row. */
export const inject = [
  'slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'settingsScope', 'uiWorkspace', 'remote', 'remote.session',
]

/**
 * Client plugin body: register the dictionaries, bind the durable open-mode
 * policy, register the explorer as a right-Sidebar tab type, listen for the
 * gesture events, and contribute the settings row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-explorer: dictionaries')
  const t = ctx.locale.bind(NS)

  // The tab type and its body register once for the plugin's lifetime;
  // upstream's model is persistent types, and the panel's internal strip
  // simply starts empty. A claim reveals the column by opening the page.
  ctx.effect(() => ctx.sidebarRightTabs.register(explorerDefinition(t)), 'ui-sdkwork-explorer: tab type')

  const settingsScope = ctx.get('settingsScope')
  if (settingsScope === undefined) {
    throw new Error('ui-sdkwork-explorer requires the settingsScope service')
  }
  const scope = settingsScope.bind<ExplorerSettings>({ namespace: EXPLORER_SETTINGS_NAMESPACE })
  const policy = new OpenModePolicy(scope)

  const uiWorkspace = ctx.get('uiWorkspace')
  if (uiWorkspace === undefined) {
    throw new Error('ui-sdkwork-explorer requires the uiWorkspace service')
  }
  const sessionNamespace = ctx.remote.session

  const service = new SdkworkExplorerService({
    t,
    openExplorerTab: () => { ctx.sidebarRight.openTab(EXPLORER_KIND) },
    readTextFile: (path, signal) => uiWorkspace.readTextFile(path, signal),
    writeTextFile: async (path, content) => { await uiWorkspace.writeTextFile(path, content) },
    openNativeFile: async (path) => {
      const result = await sessionNamespace.openWorkspacePath({ path })
      if (!result.ok) {
        throw new Error(`path open failed: ${result.error.message}`)
      }
    },
    openExternalUrl: (url) => { window.open(url, '_blank', 'noopener,noreferrer') },
    setOpenMode: (subject, mode: ExplorerOpenMode) => { policy.set(subject, mode) },
  })

  // The panel's close button collapses the column (openTab expands it again
  // on the next claim); the explorer page tab itself stays in the strip.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    {
      name: 'sidebar.right.pane.tab',
      key: EXPLORER_ID,
      locale: NS,
      inject: () => ({
        controller: service,
        closePanel: () => {
          if (ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded()
        },
      }),
    },
    ExplorerPanel,
  )), 'ui-sdkwork-explorer: explorer tab body')

  const onOpenFile = (event: Event): void => {
    const detail = (event as CustomEvent<ExplorerOpenFileDetail | undefined>).detail
    if (detail === undefined || detail.path === '') return
    const decision = routeOpen(policy.file.getSnapshot())
    if (decision === 'pass') return
    event.preventDefault()
    if (decision === 'tab') service.openFile(detail.path, detail.cwd)
    else service.showChooser({ subject: 'file', path: detail.path, cwd: detail.cwd }, detail.x, detail.y)
  }
  // The diff preview is inherently a built-in surface — the operating system
  // has no patch viewer to hand a change to — so it bypasses the open-mode
  // policy and always claims. Malformed hunks stay unclaimed so the
  // dispatcher's native-open fallback still gives the click an outcome.
  const onOpenDiff = (event: Event): void => {
    const detail = (event as CustomEvent<ExplorerOpenDiffDetail | undefined>).detail
    if (detail === undefined || detail.path === '') return
    if (!isDiffHunks(detail.hunks)) return
    event.preventDefault()
    service.openFileDiff(detail)
  }
  const onOpenUrl = (event: Event): void => {
    const detail = (event as CustomEvent<ExplorerOpenUrlDetail | undefined>).detail
    if (detail === undefined || detail.url === '') return
    let protocol = ''
    try {
      protocol = new URL(detail.url).protocol
    } catch {
      return
    }
    if (protocol !== 'https:' && protocol !== 'http:') return
    const decision = routeOpen(policy.link.getSnapshot())
    if (decision === 'pass') return
    event.preventDefault()
    if (decision === 'tab') service.openUrl(detail.url)
    else service.showChooser({ subject: 'link', url: detail.url }, detail.x, detail.y)
  }

  ctx.effect(() => {
    document.addEventListener(EXPLORER_OPEN_FILE_EVENT, onOpenFile)
    document.addEventListener(EXPLORER_OPEN_DIFF_EVENT, onOpenDiff)
    document.addEventListener(EXPLORER_OPEN_URL_EVENT, onOpenUrl)
    return () => {
      document.removeEventListener(EXPLORER_OPEN_FILE_EVENT, onOpenFile)
      document.removeEventListener(EXPLORER_OPEN_DIFF_EVENT, onOpenDiff)
      document.removeEventListener(EXPLORER_OPEN_URL_EVENT, onOpenUrl)
      service.closeChooser()
    }
  }, 'ui-sdkwork-explorer: gesture listeners')

  ctx.provide('sdkworkExplorer', service)

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'sdkwork-explorer',
    order: 60,
    label: () => t('settings.title'),
    locale: NS,
    inject: () => ({ policy }),
  }, ExplorerSettingsSection))
}
