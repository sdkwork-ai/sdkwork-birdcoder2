/**
 * Which plugins bring their own configuration to the market's Plugins page.
 *
 * The Plugins page lists two kinds of card under its Official heading: the
 * bundles the installation ships for the person to switch on, and the plugins
 * that registered a configuration page of their own. The second kind is not a
 * bundle at all — it is a host-plane namespace (shell, agent loop, subagent,
 * web search) whose settings page the deployment serves — so it has no switch
 * to flip and no dependency to remove. It still belongs on the page, because
 * that is where a person looks for it.
 *
 * This module reads the same `plugins.item` ledger the upstream Plugin manager
 * reads, with the same projection, so both pages list the same plugins in the
 * same order.
 *
 * The projection follows the slot ledger and the active locale, and keeps its
 * snapshot until one of them moves — a `useSyncExternalStore` source.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { resolveSlotLabel, type HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
// Cross-plugin collaboration goes through the slot registry, never a value
// import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'

/** One configuration-carrying plugin: its registration id and its title in the active locale. */
export interface OfficialItem {
  /** The `plugins.item` registration id (also the card's DOM identity). */
  readonly id: string
  /** The localized title, as the registering plugin declared it. */
  readonly label: string
}

const SLOT = 'plugins.item'

/**
 * Project the `plugins.item` ledger as one observable the panel binds.
 * @param ctx - the market plugin's context, whose slot registry and locale the projection follows.
 * @returns the ledger source; its snapshot changes only when the ledger or the locale does.
 */
export function officialItemsSource(ctx: ClientContext): HostObservable<readonly OfficialItem[]> {
  let version = -1
  let revision = -1
  let items: readonly OfficialItem[] = []
  return {
    getSnapshot: () => {
      const nextVersion = ctx.slots.getVersion(SLOT)
      const nextRevision = ctx.locale.getSnapshot().revision
      if (nextVersion !== version || nextRevision !== revision) {
        version = nextVersion
        revision = nextRevision
        items = ctx.slots.entries(SLOT).map(entry => ({
          /* v8 ignore next -- list-slot registration requires id */
          id: entry.options.id ?? '',
          label: resolveSlotLabel(entry.options.label) ?? '',
        }))
      }
      return items
    },
    subscribe: (listener) => {
      const offSlot = ctx.slots.subscribe(SLOT, listener)
      const offLocale = ctx.locale.subscribe(listener)
      return () => { offSlot(); offLocale() }
    },
  }
}
