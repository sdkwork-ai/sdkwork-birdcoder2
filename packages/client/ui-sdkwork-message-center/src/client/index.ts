/**
 * SDKWork message center, browser half: a mail shortcut in the mode rail above
 * Settings (`mode.rail.panel`) and the message page it selects as the center
 * column's main panel (`main`, key `message-center`). The plugin owns polling,
 * the unread badge, acknowledgement, and presentation; the notification
 * service owns visibility, ordering, and consumption.
 *
 * Selecting the shortcut is a plain panel selection through `ctx.layout`: the
 * workspace's left column stays in place and the center switches from the
 * conversation to the message page — no modal, no second window.
 *
 * The API origin and static access token come from the shared
 * [ui-sdkwork-env](../ui-sdkwork-env/README.md) profile; the signed-in
 * credential triple comes from `ctx.iam`. Without a configured origin the page
 * explains the missing configuration, and without credentials it offers the
 * in-app sign-in surface instead of an error.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-message-center/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SyncedConfig } from '@deepseek-ai/dsh-client-config/types'
// Type-only: pulls ctx.slots, ctx.layout, and the 'main' seat declaration.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the 'mode.rail.panel' seat declaration.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.env (the shared deployment environment) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
// Type-only: pulls ctx.iam (the sign-in service face) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { MessageCenterRailEntry, type MessageCenterRailEntryInjected } from './MessageCenterRailEntry.tsx'
import { MessageCenterView, type MessageCenterViewInjected } from './MessageCenterView.tsx'
import {
  MessageCenterService,
  type MessageCenterIamLike,
  type MessageCenterSnapshot,
} from './message-service.ts'
import { MESSAGE_CENTER_PANEL_ID } from './panel-id.ts'
import { en, zh, type MessageCenterKey } from './locales.ts'
import type { MessageCenterConfig } from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The message center's copy (rail shortcut, page shell, and states). */
    messageCenter: MessageCenterKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'messageCenter'

/** Poll interval while the Host has not synced one; equals the Host schema default. */
const ABSENT_POLL_INTERVAL_MS = 60_000

/** Page size while the Host has not synced one; equals the Host schema default. */
const ABSENT_PAGE_SIZE = 20

/** Services required by the message-center plugin. */
export const inject = ['slots', 'locale', 'env', 'iam', 'layout']

/**
 * Register the dictionaries, the notification service and its poll, the
 * message page as a `main` panel, and the rail shortcut above Settings.
 * @param ctx - client root context.
 * @param config - Host-synced polling interval and page size.
 */
export function apply(ctx: ClientContext, config: SyncedConfig<MessageCenterConfig>): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-message-center: dictionaries')

  const env = ctx.get('env') as EnvService
  // The service consumes the session-token reader and the optional sign-in
  // gesture; a provider other than the shipped IAM service may omit the
  // latter, and the page then offers no sign-in button.
  const iam = ctx.get('iam') as MessageCenterIamLike
  const service = new MessageCenterService({
    env,
    iam,
    pollIntervalMs: () => config.pollIntervalMs.get() ?? ABSENT_POLL_INTERVAL_MS,
    pageSize: () => config.pageSize.get() ?? ABSENT_PAGE_SIZE,
  })
  ctx.effect(() => {
    const stop = service.start()
    return () => {
      stop()
      service.dispose()
    }
  }, 'ui-sdkwork-message-center: notification polling')

  // One observable source per fact pair: the rail badge and the page read the
  // same snapshot, so both surfaces agree on unread state.
  const snapshot: HostObservable<MessageCenterSnapshot> = {
    getSnapshot: () => service.snapshot(),
    subscribe: listener => service.subscribe(listener),
  }
  const refresh = (): void => { void service.refresh() }
  const open = (): void => {
    refresh()
    ctx.layout.selectPanel(MESSAGE_CENTER_PANEL_ID)
  }

  // The message page itself: the frame renders this keyed `main` entry in
  // place of the conversation while the panel is selected. The page's close
  // gesture returns the center column to the current conversation.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: MESSAGE_CENTER_PANEL_ID,
    locale: NS,
    inject: (): MessageCenterViewInjected => ({
      hooks: { snapshot },
      refresh,
      loadMore: () => { void service.loadMore() },
      markRead: (id) => { void service.acknowledge(id) },
      signIn: () => { void service.signIn() },
      canSignIn: iam.requestSignInInPlace !== undefined,
      close: () => { ctx.layout.selectPanel(null) },
    }),
  }, MessageCenterView))

  // The rail shortcut ordering: the panel seat renders ascending, so a later
  // order sits closer to Settings. 20 renders below the IM connector row (10)
  // and directly above the Settings seat.
  ctx.slots.inject('mode.rail.panel', () => ctx.slots.register({
    name: 'mode.rail.panel',
    id: MESSAGE_CENTER_PANEL_ID,
    order: 20,
    locale: NS,
    inject: (): MessageCenterRailEntryInjected => ({ open, hooks: { snapshot } }),
  }, MessageCenterRailEntry))
}

export type { MessageCenterRailEntryInjected, MessageCenterRailEntryProps } from './MessageCenterRailEntry.tsx'
export type { MessageCenterViewInjected, MessageCenterViewProps } from './MessageCenterView.tsx'
export type { MessageCenterSnapshot, MessageCenterStatus } from './message-service.ts'
export type { MessageItem, MessagePage } from './message-contract.ts'
export type { MessageCenterKey } from './locales.ts'
