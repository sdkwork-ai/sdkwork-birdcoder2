/**
 * SDKWork share plugin, browser half: registers a share icon into the
 * session-header utilities seat (the header's right cluster), immediately to
 * the right of the publish action (order -8) and still left of the
 * Session-log ellipsis icon (order 0). The popover copies the current session
 * ID and lists recently published deploy_app records (best-effort) with
 * one-click copy of their application IDs.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { ShareAction } from './ShareAction.tsx'
import { ShareHost, type ShareHostEnvironment, type ShareHostIam } from './shareHost.ts'
import { en, NS, zh, type ShareKey } from './locales.ts'

export type { ShareActionProps } from './ShareAction.tsx'
export type {
  ShareHost,
  ShareHostEnvironment,
  ShareHostIam,
  ShareHostIamSession,
} from './shareHost.ts'
export type { ShareKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork share plugin copy. */
    share: ShareKey
  }
}

/** Required services for locale registration and header-slot contribution. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Client plugin body: register the dictionaries, the host adapter, and the
 * session-header share action (right of the publish application action).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-share: dictionaries')

  const host = new ShareHost({
    env: ctx.get('env') as ShareHostEnvironment,
    iam: ctx.get('iam') as ShareHostIam,
  })
  host.mount()
  ctx.effect(() => () => { host.dispose() }, 'ui-sdkwork-share: SDKWork host adapter')

  ctx.slots.inject(
    // The conversation header's right utility cluster: immediately right of
    // the publish-application action (order -8), left of the Session-log
    // ellipsis icon (the session-log-download "…" more-button at order 0).
    'conversation.session.header.utilities',
    () => ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'sdkwork-share',
      order: -6,
      locale: NS,
      inject: (): { host: ShareHost } => ({ host }),
    }, ShareAction),
  )
}
