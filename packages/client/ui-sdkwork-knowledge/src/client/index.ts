/**
 * Knowledge Base mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-sdkwork-app-modes' rail shell)
 * and its SDKWork-backed page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `knowledge` mode id. The host adapter
 * is configured from the shared environment, IAM, and locale services before
 * the page can mount.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the rail-entry slot contract (ui-sdkwork-app-modes' declaration) and
// the AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.env and ctx.iam into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { injectAuthenticatedModePage } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {
  KnowledgebaseHostAdapter,
  KnowledgebaseHostIam,
  KnowledgebaseHostTheme,
} from './knowledgebaseHost.ts'
import { configureKnowledgebaseHost } from './knowledgebaseHost.ts'
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
export const inject = ['slots', 'locale', 'env', 'iam', 'theme']

/**
 * Configure the SDKWork host adapter through an injectable test seam.
 * @param env - active BirdCoder deployment environment service.
 * @param iam - active BirdCoder IAM session provider.
 * @param locale - BirdCoder locale runtime.
 * @returns Configured SDKWork host adapter and its disposer.
 */
export function createKnowledgebaseAdapter(
  env: EnvService,
  iam: KnowledgebaseHostIam,
  locale: LocaleRuntime,
  theme: KnowledgebaseHostTheme,
): KnowledgebaseHostAdapter {
  return configureKnowledgebaseHost({ env, iam, locale, theme })
}

/**
 * Register the Knowledge Base host adapter, rail entry, and page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-knowledge: dictionaries')
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: KnowledgebaseHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const adapter = createKnowledgebaseAdapter(
    ctx.get('env') as EnvService,
    ctx.get('iam') as KnowledgebaseHostIam,
    ctx.locale,
    theme,
  )
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-knowledge: SDKWork host adapter')

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
    inject: (): KnowledgePageInjected => injectAuthenticatedModePage(ctx, 'knowledge'),
  }, KnowledgePage))
}
