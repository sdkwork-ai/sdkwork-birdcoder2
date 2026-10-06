/**
 * Demand Hall plugin, browser half: registers its quick entry into the
 * sidebar shell's `sidebar.actions` list seat (declared by ui-sidebar) below
 * the template-library entry, and its page into the keyed `mode.page` seat
 * (declared by ui-layout's frame), both keyed by the `demand-hall` mode id.
 * The entry opens the page as an overlay inside the code surface, the same
 * channel the market and template-library entries drive. The page hosts the
 * SDKWork App Store 需求大厅 (demand publishing and claiming page) through
 * the embeddable single-page surface, configured from the shared environment,
 * IAM, and locale services.
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
  DemandHallHostIam,
  DemandHallHostTheme,
} from './demandHallHost.ts'
import { configureDemandHallHost } from './demandHallHost.ts'
import { DemandHallAction, type DemandHallActionInjected } from './DemandHallAction.tsx'
import { DemandHallPage, type DemandHallPageInjected } from './DemandHallPage.tsx'
import { en, zh, type DemandHallKey } from './locales.ts'

export type { DemandHallActionInjected, DemandHallActionProps } from './DemandHallAction.tsx'
export type { DemandHallPageInjected, DemandHallPageProps } from './DemandHallPage.tsx'
export type { DemandHallSurfaceBoundaryProps } from './DemandHallSurfaceBoundary.tsx'
export type { DemandHallEmptySurfaceProps } from './DemandHallEmptySurface.tsx'
export type { DemandHallKey } from './locales.ts'
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
export const inject = ['slots', 'locale', 'layout', 'env', 'iam', 'theme']

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
  // runtime; IAM and locale changes propagate through host props.
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: DemandHallHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const adapter = configureDemandHallHost({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as DemandHallHostIam,
    locale: ctx.locale,
    theme,
  })
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-demand-hall: SDKWork host adapter')

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-demand-hall',
    // Below the template-library entry (order 50), last in the quick-entry stack.
    order: 51,
    locale: NS,
    inject: (): DemandHallActionInjected => ({
      // Open the page as an overlay inside the code surface: the rail
      // selection stays `code`, so the code rail entry keeps its highlight
      // while the demand hall renders in the center column.
      setMode: () => { ctx.layout.openPanel('demand-hall') },
    }),
  }, DemandHallAction))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'demand-hall',
    locale: NS,
    inject: (): DemandHallPageInjected => ({
      mode: 'demand-hall',
    }),
  }, DemandHallPage))
}
