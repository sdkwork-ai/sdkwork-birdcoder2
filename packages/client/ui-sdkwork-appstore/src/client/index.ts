/**
 * App Store mode plugin, browser half: registers its rail entry into the keyed
 * `mode.rail.entry` seat (declared by ui-sdkwork-app-modes' rail shell) and its
 * SDKWork-backed page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `appstore` mode id. The host adapter
 * is configured from the shared environment, IAM, and locale services before
 * the page can mount.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { injectAuthenticatedModePage } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {
  AppstoreHostAdapter,
  AppstoreHostIam,
  AppstoreHostTheme,
} from './appstoreHost.ts'
import { configureAppstoreHost } from './appstoreHost.ts'
import { AppStoreRailEntry, type AppStoreRailEntryInjected } from './RailEntry.tsx'
import { AppStorePage, type AppStorePageInjected } from './AppStorePage.tsx'
import { en, zh, type AppStoreKey } from './locales.ts'

export type { AppStorePageInjected, AppStorePageProps } from './AppStorePage.tsx'
export type { AppStoreRailEntryInjected, AppStoreRailEntryProps } from './RailEntry.tsx'
export type { AppStoreKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The App Store mode's rail copy. */
    appstore: AppStoreKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'appstore'

/** Services required by the App Store mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam', 'theme']

/**
 * Configure the SDKWork host adapter through an injectable test seam.
 * @param env - active BirdCoder deployment environment service.
 * @param iam - active BirdCoder IAM session provider.
 * @param locale - BirdCoder locale runtime.
 * @returns Configured SDKWork host adapter and its disposer.
 */
export function createAppstoreAdapter(
  env: EnvService,
  iam: AppstoreHostIam,
  locale: LocaleRuntime,
  theme: AppstoreHostTheme,
): AppstoreHostAdapter {
  return configureAppstoreHost({ env, iam, locale, theme })
}

/**
 * Register the App Store host adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-appstore: dictionaries')
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: AppstoreHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const adapter = createAppstoreAdapter(
    ctx.get('env') as EnvService,
    ctx.get('iam') as AppstoreHostIam,
    ctx.locale,
    theme,
  )
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-appstore: SDKWork host adapter')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'appstore',
    locale: NS,
    inject: (): AppStoreRailEntryInjected => ({ mode: 'appstore' }),
  }, AppStoreRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'appstore',
    locale: NS,
    inject: (): AppStorePageInjected => injectAuthenticatedModePage(ctx, 'appstore'),
  }, AppStorePage))
}
