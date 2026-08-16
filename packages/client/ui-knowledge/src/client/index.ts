/**
 * Knowledge Base mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-app-modes' rail shell)
 * and its placeholder page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `knowledge` mode id. The mode is an
 * independent module: glyphs, copy, and page live here and can grow into
 * the real Knowledge Base surface without touching the rail shell or the
 * frame.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the rail-entry slot contract (ui-app-modes' declaration) and
// the AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { KnowledgeRailEntry, type KnowledgeRailEntryInjected } from './RailEntry.tsx'
import { KnowledgePage, type KnowledgePageInjected } from './KnowledgePage.tsx'
import { en, zh, type KnowledgeKey } from './locales.ts'

export type {
  KnowledgePageInjected, KnowledgePageProps,
} from './KnowledgePage.tsx'
export type {
  KnowledgeRailEntryInjected, KnowledgeRailEntryProps,
} from './RailEntry.tsx'
export type { KnowledgeKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Knowledge Base mode's copy (rail entry + page). */
    knowledge: KnowledgeKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'knowledge'

/** Services required by the Knowledge Base mode plugin. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the rail entry and the placeholder page, each
 * once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-knowledge: dictionaries')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'knowledge',
    locale: NS,
    inject: (): KnowledgeRailEntryInjected => ({ mode: 'knowledge' }),
  }, KnowledgeRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'knowledge',
    locale: NS,
    inject: (): KnowledgePageInjected => ({ mode: 'knowledge' }),
  }, KnowledgePage))
}
