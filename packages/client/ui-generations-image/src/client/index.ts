/**
 * Image generation mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-app-modes' rail shell)
 * and the SDKWork Agents creative (生成) page into the keyed `mode.page` seat
 * (declared by ui-layout's frame), both keyed by the `image` mode id. The
 * host adapter is configured from the shared environment, IAM, and locale
 * services before the embedded {@link CreativeView} can mount.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the rail-entry slot contract (ui-app-modes' declaration) and
// the AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.locale (locale Context merge) into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.env and ctx.iam into this program.
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { injectAuthenticatedModePage } from '@deepseek-ai/dsh-client-ui-iam/client'
import type { CreativeHostIam } from './creativeHost.ts'
import { configureCreativeHost } from './creativeHost.ts'
import { ImageGenerationsPage, type ImageGenerationsPageInjected } from './GenerationsPage.tsx'
import { ImageGenerationsRailEntry, type ImageGenerationsRailEntryInjected } from './RailEntry.tsx'
import { en, zh, type ImageGenerationsKey } from './locales.ts'

export type {
  ImageGenerationsPageInjected, ImageGenerationsPageProps,
} from './GenerationsPage.tsx'
export type {
  ImageGenerationsRailEntryInjected, ImageGenerationsRailEntryProps,
} from './RailEntry.tsx'
export type {
  CreativeHostAdapter,
  CreativeHostEnvironment,
  CreativeHostIam,
  CreativeHostLocale,
  CreativeHostRuntime,
  CreativeHostSession,
  ConfigureCreativeHostOptions,
} from './creativeHost.ts'
export type { ImageGenerationsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The image generation mode's copy (rail entry + page). */
    generationsImage: ImageGenerationsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'generationsImage'

/** Services required by the image generation mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam', 'theme']

/**
 * Register the creative host adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-generations-image: dictionaries')
  const adapter = configureCreativeHost({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as CreativeHostIam,
    locale: ctx.locale as LocaleRuntime,
    theme: {
      getColorScheme: () => (ctx.get('theme') as ThemeRuntime).getTheme().active.colorScheme,
      subscribe: listener => ctx.on('theme/change', listener),
    },
  })
  ctx.effect(() => () => { adapter.dispose() }, 'ui-generations-image: SDKWork creative host adapter')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'image',
    locale: NS,
    inject: (): ImageGenerationsRailEntryInjected => ({ mode: 'image' }),
  }, ImageGenerationsRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'image',
    locale: NS,
    inject: (): ImageGenerationsPageInjected => injectAuthenticatedModePage(ctx, 'image'),
  }, ImageGenerationsPage))
}
