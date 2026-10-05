/**
 * Template Library plugin, browser half: registers its quick entry into the
 * sidebar shell's `sidebar.actions` list seat (declared by ui-sidebar) below
 * the market entry, and its page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `template-library` mode id. The entry
 * opens the page as an overlay inside the code surface, the same channel the
 * market and automation entries drive. The page hosts the SDKWork App Store
 * templates catalog through the embeddable single-page surface, configured
 * from the shared environment, IAM, and locale services.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.env and ctx.iam into this program (the SDKWork host
// adapter's services).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {
  TemplateLibraryHostIam,
  TemplateLibraryHostTheme,
} from './templateLibraryHost.ts'
import { configureTemplateLibraryHost } from './templateLibraryHost.ts'
import type { DeployTemplateInstallProgress, DeployTemplatePort, DeployTemplateRow } from './DeployTemplatePanel.tsx'
import { TemplateLibraryAction, type TemplateLibraryActionInjected } from './TemplateLibraryAction.tsx'
import { TemplateLibraryPage, type TemplateLibraryPageInjected } from './TemplateLibraryPage.tsx'
import { en, zh, type TemplateLibraryKey } from './locales.ts'

export type { TemplateLibraryActionInjected, TemplateLibraryActionProps } from './TemplateLibraryAction.tsx'
export type { TemplateLibraryPageInjected, TemplateLibraryPageProps } from './TemplateLibraryPage.tsx'
export type { TemplateLibrarySurfaceBoundaryProps } from './TemplateLibrarySurfaceBoundary.tsx'
export type { TemplateLibraryEmptySurfaceProps } from './TemplateLibraryEmptySurface.tsx'
export type { TemplateLibraryKey } from './locales.ts'
export type {
  ConfigureTemplateLibraryHostOptions,
  TemplateLibraryHostAdapter,
  TemplateLibraryHostEnvironment,
  TemplateLibraryHostIam,
  TemplateLibraryHostLocale,
  TemplateLibraryHostRenderSnapshot,
  TemplateLibraryHostRuntime,
  TemplateLibraryHostSession,
  TemplateLibraryHostSessionSnapshot,
  TemplateLibraryHostTheme,
} from './templateLibraryHost.ts'
export { createTemplateLibraryHostRuntime, toTemplateLibrarySession } from './templateLibraryHost.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Template Library's copy (sidebar entry, status faces). */
    'template-library': TemplateLibraryKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'template-library'

/**
 * Structural slice of ui-sdkwork-deploy's `deployPublish` service the install
 * panel consumes (declared locally: cross-package runtime imports are
 * forbidden, and the service is the sanctioned crossing).
 */
interface DeployPublishInstallFace {
  host: {
    readClients(): {
      deployClient: {
        template: {
          marketplaceTemplates: {
            list(params: {
              page?: number
              pageSize?: number
              keyword?: string
            }): Promise<{ items: readonly { id: string; displayName: string; templateKey: string; version: string }[] }>
          }
        }
      }
    }
  }
  installTemplate(options: {
    templateId: string
    targetDirectory: string
    reportProgress?: ((progress: DeployTemplateInstallProgress) => void) | undefined
  }): Promise<{ fileCount: number }>
}

/** Directory picker face of the ui-workspace service (structural slice). */
interface LibraryPickDirectoryFace {
  pickDirectory(): Promise<string | null | undefined>
}

/** Services required by the Template Library plugin. */
export const inject = [
  'slots', 'locale', 'layout', 'env', 'iam', 'theme', 'uiWorkspace', 'deployPublish',
]

/**
 * Client plugin body: register the sidebar entry and the templates page, each
 * once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-template-library: dictionaries')

  // The SDKWork host adapter: the templates page reads the active environment's
  // gateway (empty keeps the page on its unconfigured face), the mounted IAM
  // session, and the host locale. Environment changes remount the App Store
  // runtime; IAM and locale changes propagate through host props.
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: TemplateLibraryHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const adapter = configureTemplateLibraryHost({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as TemplateLibraryHostIam,
    locale: ctx.locale,
    theme,
  })
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-template-library: SDKWork host adapter')

  // The deploy-template install port: search over the marketplace, install
  // through the deploy plugin's service, and pick the target directory
  // through the workspace bridge. Both services are optional at runtime —
  // compositions without the deploy plugin or the workspace bridge mount the
  // catalog without the install panel. The marketplace requires a signed-in
  // tenant, so a signed-out visitor (no IAM session, no static env token)
  // gets the login hint up front instead of a raw Access-Token wire error.
  const deployPublish = ctx.get('deployPublish') as DeployPublishInstallFace | undefined
  const uiWorkspace = ctx.get('uiWorkspace') as LibraryPickDirectoryFace | undefined
  const envService = ctx.get('env') as EnvService
  const signedIn = (): boolean => {
    const session = (ctx.get('iam') as TemplateLibraryHostIam).controller.getState().session
    if (session !== null && session !== undefined) return true
    return envService.accessToken().trim() !== ''
  }
  const deployTemplates: DeployTemplatePort | undefined = (() => {
    if (deployPublish === undefined) return undefined
    return {
      search: async (keyword) => {
        if (!signedIn()) throw new Error(ctx.locale.bind(NS)('deploy.loginRequired'))
        const page = await deployPublish.host.readClients().deployClient.template.marketplaceTemplates.list({
          page: 1,
          pageSize: 20,
          ...(keyword.trim() === '' ? {} : { keyword: keyword.trim() }),
        })
        const rows: DeployTemplateRow[] = page.items.map(item => ({
          id: item.id,
          displayName: item.displayName,
          templateKey: item.templateKey,
          version: item.version,
        }))
        return rows
      },
      install: options => deployPublish.installTemplate(options),
      ...(uiWorkspace === undefined
        ? { pickDirectory: async (): Promise<string | undefined> => undefined }
        : {
          pickDirectory: async (): Promise<string | undefined> => {
            const picked = await uiWorkspace.pickDirectory()
            return picked ?? undefined
          },
        }),
    }
  })()

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-template-library',
    // Below the market entry (order 40), last in the quick-entry stack.
    order: 50,
    locale: NS,
    inject: (): TemplateLibraryActionInjected => ({
      // Open the page as an overlay inside the code surface: the rail
      // selection stays `code`, so the code rail entry keeps its highlight
      // while the template library renders in the center column.
      setMode: () => { ctx.layout.openPanel('template-library') },
    }),
  }, TemplateLibraryAction))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'template-library',
    locale: NS,
    inject: (): TemplateLibraryPageInjected => ({
      mode: 'template-library',
      ...(deployTemplates === undefined ? {} : { deployTemplates }),
    }),
  }, TemplateLibraryPage))
}
