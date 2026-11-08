/**
 * SDKWork official-account (公众号) management plugin, browser half: registers
 * the "公众号账号" settings-menu row's dialog into the settings-menu shell's
 * `settings.officialAccounts` seat and hosts the SDKWork IAM official-account
 * capability inside it.
 *
 * The capability itself lives in `@sdkwork/iam-pc-admin-oauth` (the IAM PC
 * admin workspace mounts the same panel): this plugin owns only the harness
 * frame — the settings row, the dialog chrome, the host adapter that binds the
 * shared deployment environment and IAM session to the SDKWork clients, and the
 * locale/theme bridge. Registered capability: account configuration (AppID,
 * AppSecret, type, original id, message-push notifications, the follow QR
 * code) plus the custom-menu editor, which is what later menu publishing and
 * article pushes operate on.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the settings slot declarations (settings.officialAccounts).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.env into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
// Type-only: pulls ctx.iam into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
// Type-only: pulls ctx.theme + theme/change into this program.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { OfficialAccountsModal, type OfficialAccountsModalInjected } from './OfficialAccountsModal.tsx'
import { mountOfficialAccountsHost } from './officialAccountsHost.ts'
import { en, NS, zh, type OfficialAccountsKey } from './locales.ts'
import './officialAccountsView.css'

export type { OfficialAccountsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork official-account management plugin copy. */
    officialAccounts: OfficialAccountsKey
  }
}

/** Services required by the plugin: slot registration, copy, and the host faces. */
export const inject = ['slots', 'locale', 'env', 'iam', 'theme']

/**
 * Client plugin body: register the dictionaries, mount the host adapter, and
 * contribute the official-account dialog to the settings-menu shell.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-official-accounts: dictionaries')

  const env = ctx.get('env') as EnvService
  const iam = ctx.get('iam') as IamService
  const theme = ctx.get('theme') as ThemeRuntime
  const host = mountOfficialAccountsHost({ env, iam })
  ctx.effect(() => () => { host.dispose() }, 'ui-sdkwork-official-accounts: SDKWork host adapter')

  ctx.slots.inject('settings.officialAccounts', () => ctx.slots.register({
    name: 'settings.officialAccounts',
    locale: NS,
    inject: (): OfficialAccountsModalInjected => ({
      host,
      startSignIn: () => { iam.startSignIn() },
      hooks: {
        // Readiness is the adapter's, so an environment switch re-evaluates the
        // notice and the panel without the row unmounting.
        available: {
          getSnapshot: () => host.readReady(),
          subscribe: listener => host.subscribe(listener),
        },
        // The sign-in gate reads the shared IAM controller: a successful login
        // (from the dialog's own action or anywhere else) swaps the prompt for
        // the panel in place.
        signedIn: {
          getSnapshot: () => iam.isSignedIn(),
          subscribe: listener => iam.controller.subscribe(listener),
        },
        language: {
          getSnapshot: () => ctx.locale.getSnapshot().active,
          subscribe: listener => ctx.locale.subscribe(listener),
        },
        colorScheme: {
          getSnapshot: () => theme.getTheme().active.colorScheme,
          subscribe: listener => ctx.on('theme/change', listener),
        },
      },
    }),
  }, OfficialAccountsModal))
}
