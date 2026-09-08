/**
 * SDKWork conversation header plugin, browser half: claims the
 * 'conversation.session.header.surface' seat declared by ui-conversation's
 * header entry and replaces the header body with a single-row layout whose
 * View navigation is an icon+label segmented control centered in the row.
 * The upstream body stays mounted as the fallback when this plugin is absent.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { SdkworkConversationHeader } from './ConversationHeader.tsx'
import { en, NS, zh, type HeaderKey } from './locales.ts'

export type { HeaderKey } from './locales.ts'
export type {
  SdkworkConversationHeader,
  SdkworkConversationHeaderProps,
} from './ConversationHeader.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork conversation header copy. */
    sdkworkConversationHeader: HeaderKey
  }
}

/** Services required for locale registration and the header-surface contribution. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the header surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-conversation-header: dictionaries')

  ctx.slots.inject(
    'conversation.session.header.surface',
    () => ctx.slots.register({
      name: 'conversation.session.header.surface',
      locale: NS,
    }, SdkworkConversationHeader),
  )
}
