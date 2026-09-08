/**
 * SDKWork git plugin, browser half: registers the session-header git branch
 * pill. The pill renders the current project's checked-out branch and opens
 * the branch-switcher popover (search, checkout, create-and-checkout, commit
 * graph) over the `sdkworkGit` Remote. Compositions without the Remote
 * namespace mount no pill instead of failing the header.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.session.header.utilities' SlotMap row (declared
// by the slot's owning package) must be in the program for the register call to type.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { GitBranchPill } from './GitBranchPill.tsx'
import { sdkworkGitPortOf } from './gitPort.ts'
import { en, NS, zh, type GitKey } from './locales.ts'

export type { GitKey } from './locales.ts'
export type { GitBranchPill, GitBranchPillProps } from './GitBranchPill.tsx'
export { sdkworkGitPortOf } from './gitPort.ts'
export type { SdkworkGitPort } from './gitPort.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork git plugin copy. */
    sdkworkGit: GitKey
  }
}

/** Services required for locale registration and the header contribution. */
export const inject = ['slots', 'locale', 'remote', 'remote.sdkworkGit']

/**
 * Client plugin body: register the dictionaries and the header actions entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'ui-sdkwork-git: dictionaries',
  )
  const git = sdkworkGitPortOf(ctx)
  // No namespace → the host composition lacks the git controller; keep the
  // header unchanged instead of mounting a pill that can never resolve.
  if (git === undefined) return

  ctx.slots.inject(
    // The conversation header's RIGHT-aligned utility cluster (the window's
    // top-right corner) — the product position for the git tools entry.
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'sdkwork-git-branch-pill',
      locale: NS,
      inject: () => ({ git }),
    }, GitBranchPill),
  )
}
