/**
 * Generated-assets mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-app-modes' rail shell)
 * and its SDKWork Agents-backed page into the keyed `mode.page` seat
 * (declared by ui-layout's frame), both keyed by the `assets` mode id. The
 * registrations shadow the placeholder entries of `@deepseek-ai/dsh-client-ui-assets`
 * at a lower priority, so the real library renders while the placeholder
 * package stays untouched. The assets adapter is configured from the shared
 * environment and IAM services before the page can load.
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
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import { AssetsPage, type AssetsPageInjected } from './AssetsPage.tsx'
import { AssetsGenerationsRailEntry, type AssetsGenerationsRailEntryInjected } from './RailEntry.tsx'
import { AssetsService, type AssetsIamService } from './assets-service.ts'
import { en, zh, type AssetsGenerationsKey } from './locales.ts'

export type {
  AssetsPageInjected, AssetsPageProps,
  AssetsFilterKind,
} from './AssetsPage.tsx'
export type {
  AssetsGenerationsRailEntryInjected, AssetsGenerationsRailEntryProps,
} from './RailEntry.tsx'
export type {
  GeneratedAssetItem,
  AssetsSnapshot,
  AssetsIamService,
} from './assets-service.ts'
export type { AssetsGenerationsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The generated-assets mode's copy (rail entry + page). */
    generationsAssets: AssetsGenerationsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'generationsAssets'

/** Services required by the generated-assets mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Cell shadowing rank: lower than the placeholder registrations (default 0),
 * so the real library renders while `ui-assets` remains the fallback.
 */
const SHADOW_PRIORITY = -10

/**
 * Register the generated-assets adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-generations-assets: dictionaries')

  const service = new AssetsService(
    ctx.get('env') as EnvService,
    ctx.get('iam') as AssetsIamService,
  )
  ctx.effect(() => service.start(), 'ui-generations-assets: environment and IAM synchronization')

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
    inject: (): AssetsPageInjected => ({
      mode: 'assets',
      load: () => { void service.load() },
      hooks: {
        assets: {
          getSnapshot: () => service.getSnapshot(),
          subscribe: listener => service.subscribe(listener),
        },
      },
    }),
  }, AssetsPage))
}
