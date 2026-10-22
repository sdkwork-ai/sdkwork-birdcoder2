/**
 * SDKWork IM conversation pane plugin, browser half: fills the chat page's
 * `im.chat.pane` seat with the conversation surface from the deployment's IM
 * embed bundle. It owns no page, no rail entry, and no IM data.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the renderer's ctx.slots service declaration into this program.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the slots service declaration and the pane seat contract.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-im-conversations/client'
import type { ImService, ImSurfaceHandle } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ChatPane, type ChatPaneInjected } from './ChatPane.tsx'

export type { ChatPaneInjected, ChatPaneProps } from './ChatPane.tsx'

/** Handle returned when the pane mounts without the IM service. */
const NOOP_SURFACE: ImSurfaceHandle = { update: () => {}, dispose: () => {} }

/** Services required by the conversation pane. */
export const inject = ['slots', 'im']

/**
 * Register the conversation pane into the chat page's pane seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const im = ctx.get('im') as ImService | undefined
  ctx.slots.inject('im.chat.pane', () => ctx.slots.register({
    name: 'im.chat.pane',
    inject: (): ChatPaneInjected => ({
      mountSurface: (container, request) => im?.mountSurface(container, request) ?? NOOP_SURFACE,
    }),
  }, ChatPane))
}
