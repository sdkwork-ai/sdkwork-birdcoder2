/**
 * SDKWork deploy publishing plugin, browser half: registers a publish icon
 * into the session-header action seat (right of the session log) that opens
 * the shared create-deploy-app dialog from @sdkwork/deployments-pc-console-publishing.
 *
 * The host adapter constructs the generated deploy/drive clients from the
 * shared ui-sdkwork-env and ui-sdkwork-iam services (via the global token
 * manager), so the dialog stays host-agnostic and reusable.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { DeployPublishAction } from './DeployPublishAction.tsx'
import { DeployHost, type DeployHostIam, type DeployHostEnvironment } from './deployHost.ts'
import { en, NS, zh, type DeployKey } from './locales.ts'

export type { DeployPublishActionProps } from './DeployPublishAction.tsx'
export type {
  DeployHost,
  DeployHostClients,
  DeployHostEnvironment,
  DeployHostIam,
  DeployHostIamSession,
} from './deployHost.ts'
export type { DeployKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork publish plugin copy. */
    deploy: DeployKey
  }
}

/** Required services for locale registration and header-slot contribution. */
export const inject = ['slots', 'locale', 'env', 'iam', 'theme']

/**
 * Client plugin body: register the dictionaries, the host adapter, and the
 * session-header publish action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-deploy: dictionaries')

  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const host = new DeployHost({
    env: ctx.get('env') as DeployHostEnvironment,
    iam: ctx.get('iam') as DeployHostIam,
  })
  host.mount()
  ctx.effect(() => () => { host.dispose() }, 'ui-sdkwork-deploy: SDKWork host adapter')

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'sdkwork-deploy-publish',
      // After the subagent catalog and the job list: publish sits at the far
      // end of the session-log action strip.
      order: 40,
      locale: NS,
      inject: (): { host: DeployHost; theme: { getColorScheme(): 'light' | 'dark'; subscribe(listener: () => void): () => void } } => ({
        host,
        theme: {
          getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
          subscribe: listener => ctx.on('theme/change', listener),
        },
      }),
    }, DeployPublishAction),
  )
}
