/**
 * Generated-assets mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-sdkwork-app-modes' rail shell)
 * and the SDKWork Agents assets (资产) page into the keyed `mode.page` seat
 * (declared by ui-layout's frame), both keyed by the `assets` mode id. The
 * registrations shadow the placeholder entries of `@deepseek-ai/dsh-client-ui-sdkwork-assets`
 * at a lower priority, so the real library renders while the placeholder
 * package stays untouched. The host adapter is configured from the shared
 * environment, IAM, and locale services before the embedded {@link AssetsView}
 * can mount.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { injectAuthenticatedModePage } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { AssetsHostIam } from './assetsHost.ts'
import { configureAssetsHost } from './assetsHost.ts'
import { AssetsPage, type AssetsPageInjected } from './AssetsPage.tsx'
import { AssetsGenerationsRailEntry, type AssetsGenerationsRailEntryInjected } from './RailEntry.tsx'
import { en, zh, type AssetsGenerationsKey } from './locales.ts'

export type {
  AssetsPageInjected, AssetsPageProps,
} from './AssetsPage.tsx'
export type {
  AssetsGenerationsRailEntryInjected, AssetsGenerationsRailEntryProps,
} from './RailEntry.tsx'
export type {
  AssetsHostAdapter,
  AssetsHostEnvironment,
  AssetsHostIam,
  AssetsHostLocale,
  AssetsHostRuntime,
  AssetsHostSession,
  ConfigureAssetsHostOptions,
} from './assetsHost.ts'
export type { AssetsGenerationsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The generated-assets mode's copy (rail entry). */
    generationsAssets: AssetsGenerationsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'generationsAssets'

/** Services required by the generated-assets mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam', 'theme']

/**
 * Cell shadowing rank: lower than the placeholder registrations (default 0),
 * so the real library renders while `ui-sdkwork-assets` remains the fallback.
 */
const SHADOW_PRIORITY = -10

/**
 * Register the assets host adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-generations-assets: dictionaries')
  const adapter = configureAssetsHost({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as AssetsHostIam,
    locale: ctx.locale as LocaleRuntime,
    theme: {
      getColorScheme: () => (ctx.get('theme') as ThemeRuntime).getTheme().active.colorScheme,
      subscribe: listener => ctx.on('theme/change', listener),
    },
  })
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-generations-assets: SDKWork assets host adapter')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'assets',
    priority: SHADOW_PRIORITY,
    locale: NS,
    inject: (): AssetsGenerationsRailEntryInjected => ({ mode: 'assets' }),
  }, AssetsGenerationsRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'assets',
    priority: SHADOW_PRIORITY,
    locale: NS,
    inject: (): AssetsPageInjected => injectAuthenticatedModePage(ctx, 'assets'),
  }, AssetsPage))
}
