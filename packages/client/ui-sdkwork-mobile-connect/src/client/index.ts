/**
 * Mobile connection surface, browser half: the rail shortcut directly above the
 * message center (`mode.rail.panel`, order 15) and the scan card it shows on
 * hover or as a dialog. The card's two scan destinations and the
 * allow-remote-connection switch are the durable section of this plugin's own
 * settings namespace: the section is read through `ctx.configForms` and written
 * back through the same scope, so a reload keeps the choice.
 *
 * The shortcut is presentation only — it opens no center panel, so it never
 * competes with the message center or the IM connector for the selected cell.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-mobile-connect/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ctx.slots into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the 'mode.rail.panel' seat declaration.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.configForms (the settings domain's shared form service).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { MobileConnectEntry, type MobileConnectEntryInjected } from './MobileConnectEntry.tsx'
import { en, zh, type MobileConnectKey } from './locales.ts'
import { MOBILE_CONNECT_NAMESPACE, REMOTE_ACCESS_FIELD, type MobileConnectSettings } from '../settings.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The mobile-connection surface's copy (rail shortcut, scan card, switch). */
    mobileConnect: MobileConnectKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'mobileConnect'

/** Stable id of the rail shortcut registration. */
const ENTRY_ID = 'mobile-connect'

/**
 * Rail position of the shortcut: ascending order, so 15 sits directly above the
 * message center (20) and below the IM connector row (10).
 */
const RAIL_ORDER = 15

/** Services required by the mobile-connection plugin. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Register the dictionaries and the rail shortcut, and hand the card the live
 * settings section plus one write for its switch.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-mobile-connect: dictionaries')

  const scope = ctx.configForms.get<MobileConnectSettings>(MOBILE_CONNECT_NAMESPACE)
  // The form's snapshot is already identity-stable between changes, so the
  // hook below can read it as-is; no mirrored store is needed for one card.
  const config: HostObservable<ConfigFormSnapshot<MobileConnectSettings>> = {
    getSnapshot: () => scope.getSnapshot(),
    subscribe: listener => scope.subscribe(listener),
  }
  const setRemoteAccess = async (value: boolean): Promise<boolean> => {
    try {
      return await scope.set(REMOTE_ACCESS_FIELD, value)
    } catch {
      // A transport failure is reported to the card as a refused write: the
      // switch owns the visible message, this layer owns no feedback surface.
      return false
    }
  }

  ctx.slots.inject('mode.rail.panel', () => ctx.slots.register({
    name: 'mode.rail.panel',
    id: ENTRY_ID,
    order: RAIL_ORDER,
    locale: NS,
    inject: (): MobileConnectEntryInjected => ({ hooks: { config }, setRemoteAccess }),
  }, MobileConnectEntry))
}

export type { MobileConnectEntryInjected, MobileConnectEntryProps } from './MobileConnectEntry.tsx'
export type { MobileConnectCardProps } from './MobileConnectCard.tsx'
export type { MobileConnectKey } from './locales.ts'
