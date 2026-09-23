/**
 * The market page's connection to the Host's configuration forms.
 *
 * The Plugins page renders a configuration the way the upstream Plugin manager
 * does: the page asks the `plugins.item`, `plugins.bundle.config` and
 * `plugins.row.config` ledgers for an entry's `page` view and hands that entry
 * the Host-owned form it edits. This module is the one place that answers two
 * questions, so no component ever guesses either:
 *
 * - **which** namespaces this deployment serves right now — read from the
 *   shared settings describe mirror and re-read reactively, because the answer
 *   changes with the composition; and
 * - **what** a row's namespace is — the effective Loader entry id with the
 *   composition-only `include:` marker removed. That is the identity the Host's
 *   `settings.mutate` resolves against, and it is deliberately NOT derived from
 *   the module specifier: a fork row may point at a differently named module
 *   (`ui-settings-general` loads `ui-sdkwork-settings-menu`) or a module may be
 *   composed twice under different ids, and a name-shaped guess silently maps a
 *   row to another plugin's namespace.
 *
 * The served list is the single source for both questions: the hook hands the
 * caller the live list (which is also what re-renders it when the Host's answer
 * moves), and {@link isServed} answers one entry against that same list. A
 * namespace with no served schema is not an error: most Loader entries carry no
 * configuration at all, and the market must never offer a settings entry that
 * opens nothing.
 */

import { useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.configForms Context merge (ui-settings' provider).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConfigPageForm } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'

/** The composition-only marker the Loader prefixes an included row's id with. */
const INCLUDE_MARKER = /^include:/

/**
 * The effective Loader entry id a settings namespace is named after.
 * @param entryId - the inventory's entry id, as the Host reports it.
 * @returns the bare id, which is what `settings.mutate` resolves against.
 */
export function namespaceOfEntry(entryId: string): string {
  return entryId.replace(INCLUDE_MARKER, '')
}

/**
 * Whether this deployment serves a settings namespace for one Loader entry.
 * The same rule the upstream Plugins page applies: the namespace IS the
 * effective entry id, so an entry is configurable exactly when the Host
 * answers for its own id — never when it merely looks like another plugin.
 * @param served - the namespaces the Host serves right now.
 * @param entryId - the inventory's entry id, as the Host reports it.
 * @returns whether a settings page for this entry can be opened.
 */
export function isServed(served: readonly string[], entryId: string): boolean {
  return served.includes(namespaceOfEntry(entryId))
}

/** The market page's resolver face for the Host's configuration forms. */
export interface MarketsConfigForms {
  /**
   * The settings namespaces this deployment serves, re-rendering the caller
   * when the Host's answer moves. A React hook: call it from a component, and
   * hold the result — it is both the answer and the re-render trigger.
   */
  useServedNamespaces: () => readonly string[]
  /**
   * The same list, read outside a render — for a callback that decides at
   * click time whether the Host still serves an entry's namespace. Both
   * accessors read the one mirror, so they cannot disagree.
   */
  servedNamespaces: () => readonly string[]
  /**
   * The page-level form one namespace's `page` view renders with, or
   * `undefined` when the deployment serves no schema for it — in which case the
   * entry must not be offered as configurable.
   */
  pageForm: (namespace: string) => ConfigPageForm | undefined
}

/**
 * Build the resolver over one client context.
 *
 * @param ctx - the market plugin's context, whose `configForms` service owns
 * the shared describe mirror and every per-namespace form.
 * @returns the resolver; its hook subscribes only while a component uses it.
 */
export function createConfigForms(ctx: ClientContext): MarketsConfigForms {
  const describe = ctx.configForms.describe()
  void describe.ensure()

  // The derive cache: `useSyncExternalStore` compares by identity, so the list
  // is rebuilt only when the mirror actually replaces its snapshot.
  let derivedFrom: unknown
  let derived: readonly string[] = []
  const servedList = (): readonly string[] => {
    const snapshot = describe.getSnapshot()
    if (snapshot !== derivedFrom) {
      derivedFrom = snapshot
      derived = snapshot.view?.namespaces.map(view => view.ns) ?? []
    }
    return derived
  }

  return {
    useServedNamespaces: () => useSyncExternalStore(
      listener => describe.subscribe(listener),
      servedList,
    ),
    servedNamespaces: servedList,
    pageForm: (namespace: string): ConfigPageForm | undefined => {
      if (!servedList().includes(namespace)) return undefined
      const form = ctx.configForms.get<Record<string, unknown>>(namespace)
      return {
        state: form.getSnapshot(),
        mutate: (ops, revision) => form.mutate(ops, revision),
      }
    },
  }
}
