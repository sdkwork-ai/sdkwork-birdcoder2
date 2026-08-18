/**
 * Drive mode plugin, browser half: registers its rail entry into the keyed
 * `mode.rail.entry` seat (declared by ui-app-modes' rail shell) and its
 * SDKWork-backed page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `drive` mode id. The host adapter is
 * configured from the shared environment, IAM, and locale services before the
 * page can mount.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the rail-entry slot contract (ui-app-modes' declaration) and
// the AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.env and ctx.iam into this program.
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-iam/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {
  DriveHostAdapter,
  DriveHostIam,
} from './driveHost.ts'
import { configureDriveHost } from './driveHost.ts'
import { DriveRailEntry, type DriveRailEntryInjected } from './RailEntry.tsx'
import { DrivePage, type DrivePageInjected } from './DrivePage.tsx'
import { en, zh, type DriveKey } from './locales.ts'

export type {
  DrivePageInjected, DrivePageProps,
} from './DrivePage.tsx'
export type {
  DriveRailEntryInjected, DriveRailEntryProps,
} from './RailEntry.tsx'
export type { DriveKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Drive mode's copy (rail entry + page). */
    drive: DriveKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'drive'

/** Services required by the Drive mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Configure the SDKWork host adapter through an injectable test seam.
 * @param env - active BirdCoder deployment environment service.
 * @param iam - active BirdCoder IAM session provider.
 * @param locale - BirdCoder locale runtime.
 * @returns Configured SDKWork host adapter and its disposer.
 */
export function createDriveAdapter(
  env: EnvService,
  iam: DriveHostIam,
  locale: LocaleRuntime,
): DriveHostAdapter {
  return configureDriveHost({ env, iam, locale })
}

/**
 * Register the Drive host adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-drive: dictionaries')
  const adapter = createDriveAdapter(
    ctx.get('env') as EnvService,
    ctx.get('iam') as DriveHostIam,
    ctx.locale,
  )
  ctx.effect(() => () => { adapter.dispose() }, 'ui-drive: SDKWork host adapter')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'drive',
    locale: NS,
    inject: (): DriveRailEntryInjected => ({ mode: 'drive' }),
  }, DriveRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'drive',
    locale: NS,
    inject: (): DrivePageInjected => ({ mode: 'drive' }),
  }, DrivePage))
}
