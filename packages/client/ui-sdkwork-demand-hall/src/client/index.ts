/**
 * Demand Hall plugin, browser half: registers its page into the left
 * sidebar's page registry (`ctx.sdkworkSidebar`, the fork's projection of
 * dsh-better-sidebar's tab/page model) and its content into the keyed
 * `mode.page` seat (declared by ui-layout's frame), both keyed by the
 * `demand-hall` mode id. The registry row opens the page as an overlay inside
 * the code surface, the same channel the market and template-library entries
 * drive. The page hosts the SDKWork App Store 需求大厅 (demand publishing and
 * claiming page) through the embeddable single-page surface, configured from
 * the shared environment, IAM, and locale services.
 */
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the runtime's Context merge (ctx.sessions, ctx.workspaces).
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the left column's page-registry service merge (ctx.sdkworkSidebar).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-sidebar/client'
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
  DemandHallHostIam,
  DemandHallHostTheme,
} from './demandHallHost.ts'
import { configureDemandHallHost } from './demandHallHost.ts'
import { createDemandProjectLauncher, createDemandProjectPort } from './demandProject.ts'
import { DemandHallIcon } from './icons.tsx'
import { DemandHallPage, type DemandHallPageInjected } from './DemandHallPage.tsx'
import { en, zh, type DemandHallKey } from './locales.ts'

export type { DemandHallPageInjected, DemandHallPageProps } from './DemandHallPage.tsx'
export type { DemandHallPageInjected, DemandHallPageProps } from './DemandHallPage.tsx'
export type { DemandHallSurfaceBoundaryProps } from './DemandHallSurfaceBoundary.tsx'
export type { DemandHallEmptySurfaceProps } from './DemandHallEmptySurface.tsx'
export type { DemandHallKey } from './locales.ts'
export type {
  DemandProjectInput,
  DemandProjectOutcome,
  DemandProjectPort,
  DemandProjectServices,
} from './demandProject.ts'
export type {
  ConfigureDemandHallHostOptions,
  DemandHallHostAdapter,
  DemandHallHostEnvironment,
  DemandHallHostIam,
  DemandHallHostLocale,
  DemandHallHostRenderSnapshot,
  DemandHallHostRuntime,
  DemandHallHostSession,
  DemandHallHostSessionSnapshot,
  DemandHallHostTheme,
} from './demandHallHost.ts'
export { createDemandHallHostRuntime, toDemandHallSession } from './demandHallHost.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Demand Hall's copy (sidebar entry, status faces). */
    'demand-hall': DemandHallKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'demand-hall'

/** Services required by the Demand Hall plugin. */
export const inject = ['slots', 'locale', 'layout', 'env', 'iam', 'theme', 'sessions', 'workspaces', 'sdkworkSidebar']

/**
 * Client plugin body: register the sidebar entry and the demands page, each
 * once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-demand-hall: dictionaries')

  // The SDKWork host adapter: the demands page reads the active environment's
  // gateway (empty keeps the page on its unconfigured face), the mounted IAM
  // session, and the host locale. Environment changes remount the App Store
  // runtime; IAM and locale changes propagate through host props. The project
  // port drives the shell's workspace and session services so the demand
  // detail's start-project action lands in one initialized workspace.
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: DemandHallHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const project = createDemandProjectLauncher(
    createDemandProjectPort(
      { workspaces: ctx.workspaces, sessions: ctx.sessions },
      ctx.locale.bind(NS),
    ),
    // A started project switches the current session; leaving the overlay open
    // would hide the session the user just created.
    () => { ctx.layout.closePanel() },
  )
  const adapter = configureDemandHallHost({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as DemandHallHostIam,
    locale: ctx.locale,
    theme,
    project,
  })
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-demand-hall: SDKWork host adapter')

  ctx.effect(() => ctx.sdkworkSidebar.registerPage({
    id: 'sdkwork-demand-hall',
    // Below the template-library entry (order 50), last in the page stack.
    order: 51,
    // Locale-owned copy: the registry re-resolves function titles when the
    // language changes.
    title: () => ctx.locale.bind(NS)('mode.demand-hall'),
    icon: ({ size }) => createElement(DemandHallIcon, { size }),
    // Open the page as an overlay inside the code surface: the rail
    // selection stays `code`, so the code rail entry keeps its highlight
    // while the demand hall renders in the center column.
    open: () => { ctx.layout.openPanel('demand-hall') },
  }), 'ui-sdkwork-demand-hall: sidebar page')

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'demand-hall',
    locale: NS,
    inject: (): DemandHallPageInjected => ({
      mode: 'demand-hall',
    }),
  }, DemandHallPage))
}
