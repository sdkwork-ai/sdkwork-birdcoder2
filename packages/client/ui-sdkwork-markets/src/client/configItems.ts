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
 * This module reads the same three slot ledgers the upstream Plugin manager
 * reads, with the same projection, so both pages list the same plugins in the
 * same order and open the same configuration:
 *
 * - `plugins.item` — one card per configuration page (the Official group's
 *   second source);
 * - `plugins.bundle.config` — keyed by bundle package name, the form a bundle
 *   renders on its own page;
 * - `plugins.row.config` — keyed by {@link rowConfigKey}, the form one row of a
 *   bundle renders on its own page.
 *
 * The projection follows the slot ledgers and the active locale, and keeps its
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

/**
 * The plugins carrying configuration, projected from the three ledgers the
 * upstream Plugin manager declares.
 */
export interface ConfigLedger {
  /** The official plugins in ledger order (the Official group's second source). */
  readonly items: readonly OfficialItem[]
  /** The package names of the bundles that registered a page-level form. */
  readonly bundles: ReadonlySet<string>
  /** The keys ({@link rowConfigKey}) of the rows that registered a page. */
  readonly rows: ReadonlySet<string>
}

/**
 * The key a row's configuration registers under.
 * @param bundle - the bundle's package name.
 * @param rowId - the row id the bundle's patch declares.
 * @returns the `plugins.row.config` key.
 */
export function rowConfigKey(bundle: string, rowId: string): string {
  return `${bundle}#${rowId}`
}

const ITEM_SLOT = 'plugins.item'
const KEYED_SLOTS = ['plugins.bundle.config', 'plugins.row.config'] as const
const ALL_SLOTS = [ITEM_SLOT, ...KEYED_SLOTS] as const

/**
 * Project the three configuration ledgers as one observable the panel binds.
 * @param ctx - the market plugin's context, whose slot registry and locale the projection follows.
 * @returns the ledger source; its snapshot changes only when a ledger or the locale does.
 */
export function configLedgerSource(ctx: ClientContext): HostObservable<ConfigLedger> {
  let versions: readonly number[] = []
  let revision = -1
  let ledger: ConfigLedger = { items: [], bundles: new Set(), rows: new Set() }
  const keysOf = (name: (typeof KEYED_SLOTS)[number]): ReadonlySet<string> =>
    new Set(ctx.slots.entries(name).flatMap(entry => entry.options.key === undefined ? [] : [entry.options.key]))
  return {
    getSnapshot: () => {
      const next = ALL_SLOTS.map(name => ctx.slots.getVersion(name))
      const current = ctx.locale.getSnapshot().revision
      if (current !== revision || next.some((version, index) => version !== versions[index])) {
        versions = next
        revision = current
        ledger = {
          items: ctx.slots.entries(ITEM_SLOT).map(entry => ({
            /* v8 ignore next -- list-slot registration requires id */
            id: entry.options.id ?? '',
            label: resolveSlotLabel(entry.options.label) ?? '',
          })),
          bundles: keysOf('plugins.bundle.config'),
          rows: keysOf('plugins.row.config'),
        }
      }
      return ledger
    },
    subscribe: (listener) => {
      const offs = [...ALL_SLOTS.map(name => ctx.slots.subscribe(name, listener)), ctx.locale.subscribe(listener)]
      return () => { for (const off of offs) off() }
    },
  }
}
