/**
 * SDKWork IM conversation list mode, browser half: registers the chat rail
 * entry (with the inbox unread badge) and the keyed chat mode page that mounts
 * sdkwork-im's conversation-list surface. The page declares the `im.chat.pane`
 * seat through its own `mode.page` registration, so the conversation plugin
 * fills only the right-hand pane.
 *
 * Selection and runtime readiness come from `ctx.im` (ui-sdkwork-im); the page
 * never talks to IM transport directly. The plugin also injects the `im`
 * service so it activates only after that provider, and it binds an absent
 * snapshot if the service disappears later: the page then shows its unavailable
 * state instead of crashing the slot entry.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer's ctx.slots service declaration into this program.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the slots service declaration and the rail-entry/mode-page contracts.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { ImService, ImSnapshot, ImSurfaceHandle } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { injectAuthenticatedModePage } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { ChatModePage, type ChatModePageInjected } from './ChatModePage.tsx'
import { ChatRailEntry, type ChatRailEntryInjected } from './RailEntry.tsx'
import { en, zh, type ImConversationsKey } from './locales.ts'

export type { ChatModePageInjected, ChatModePageProps } from './ChatModePage.tsx'
export type { ChatRailEntryInjected, ChatRailEntryProps } from './RailEntry.tsx'
export type { ImChatPaneOwnerProps } from './contract/slots.ts'
export type { ImConversationsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The chat mode's rail entry and page copy. */
    imConversations: ImConversationsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'imConversations'

/** Snapshot served while `ctx.im` is unavailable: the page renders its unavailable state. */
const ABSENT_IM_SNAPSHOT: ImSnapshot = { selectedConversationId: null, totalUnread: 0, error: 'unconfigured', notice: null }

/** Observable fallback for the hooks compartment; a missing service must not blank the entry. */
const ABSENT_IM_SOURCE: HostObservable<ImSnapshot> = {
  getSnapshot: () => ABSENT_IM_SNAPSHOT,
  subscribe: () => () => {},
}

/** Handle returned when a page asks to mount a surface without the IM service. */
const NOOP_SURFACE: ImSurfaceHandle = { update: () => {}, dispose: () => {} }

/** Services required by the conversation list mode. */
export const inject = ['slots', 'locale', 'iam', 'im']

/**
 * Register the chat rail entry and the chat mode page with its pane seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-im-conversations: dictionaries')
  const im = ctx.get('im') as ImService | undefined
  const imHook: HostObservable<ImSnapshot> = im ?? ABSENT_IM_SOURCE

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'chat',
    locale: NS,
    inject: (): ChatRailEntryInjected & { hooks: { im: HostObservable<ImSnapshot> } } => ({
      mode: 'chat',
      hooks: { im: imHook },
    }),
  }, ChatRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'chat',
    locale: NS,
    children: {
      'im.chat.pane': { kind: 'single', scope: 'root' },
    },
    inject: (): ChatModePageInjected & { hooks: { im: HostObservable<ImSnapshot> } } => ({
      ...injectAuthenticatedModePage(ctx, 'chat'),
      selectConversation: (conversationId: string) => { im?.selectConversation(conversationId) },
      mountSurface: (container, request) => im?.mountSurface(container, request) ?? NOOP_SURFACE,
      hooks: { im: imHook },
    }),
  }, ChatModePage))
}
