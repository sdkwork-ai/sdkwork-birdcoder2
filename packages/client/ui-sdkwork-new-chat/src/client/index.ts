/**
 * SDKWork New Chat plugin, browser half: registers the new-conversation entry
 * into the sidebar shell's `sidebar.actions` list seat (declared by
 * ui-sidebar). The entry rides the shell's shared New Session action — the
 * same Workspace UI flow as the built-in capsule — so starting a conversation
 * stays one flow with one owner (the Workspace UI service) no matter which
 * chrome renders the trigger.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { NewChatAction } from './NewChatAction.tsx'
import { en, zh, type NewChatKey } from './locales.ts'

export type { NewChatActionProps } from './NewChatAction.tsx'
export type { NewChatKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The New Chat sidebar entry's copy. */
    newChat: NewChatKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'newChat'

/** Services required by the New Chat entry plugin. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the New Chat entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-new-chat: dictionaries')

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-new-chat',
    // Leads the quick-entry stack, ahead of the mode entries.
    order: 10,
    locale: NS,
  }, NewChatAction))
}
