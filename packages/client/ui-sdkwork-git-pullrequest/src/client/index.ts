/**
 * Pull Request mode plugin, browser half: registers its quick entry into the
 * sidebar shell's `sidebar.actions` list seat (declared by ui-sidebar) and
 * its placeholder page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), keyed by the `pull-request` mode id. The mode is an
 * independent module: glyphs, copy, and page live here and can grow into
 * the real Git-backed review surface without touching the sidebar shell, the
 * rail, or the frame.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { PullRequestAction, type PullRequestActionInjected } from './PullRequestAction.tsx'
import { PullRequestPage, type PullRequestPageInjected } from './PullRequestPage.tsx'
import { en, zh, type PullRequestKey } from './locales.ts'

export type {
  PullRequestActionInjected, PullRequestActionProps,
} from './PullRequestAction.tsx'
export type {
  PullRequestPageInjected, PullRequestPageProps,
} from './PullRequestPage.tsx'
export type { PullRequestKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Pull Request mode's copy (sidebar entry + page). */
    pullRequest: PullRequestKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pullRequest'

/** Services required by the Pull Request mode plugin. */
export const inject = ['slots', 'locale', 'layout']

/**
 * Client plugin body: register the sidebar entry and the placeholder page,
 * each once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-git-pullrequest: dictionaries')

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-git-pullrequest',
    // Behind the New Chat entry, ahead of Automation.
    order: 20,
    locale: NS,
    inject: (): PullRequestActionInjected => ({
      // Open Pull Request as an overlay inside the code surface: the rail
      // selection stays `code`, so the code rail entry keeps its highlight
      // while the review page renders in the center column.
      setMode: () => { ctx.layout.openPanel('pull-request') },
    }),
  }, PullRequestAction))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'pull-request',
    locale: NS,
    inject: (): PullRequestPageInjected => ({ mode: 'pull-request' }),
  }, PullRequestPage))
}
