/**
 * SDKWork certificate management plugin, browser half: registers the
 * "证书管理" settings-menu row's dialog into the settings-menu shell's
 * `settings.certificates` seat and hosts the certificate capability there.
 *
 * The capability is the deployments app API (`@sdkwork/deployments-app-sdk`
 * `certificate` surface, with the `domain` surface for the verified hostnames a
 * certificate may cover — the same authority the sdkwork-webserver console
 * reads). This plugin owns only the harness frame — the settings row's dialog,
 * the host adapter that binds the shared deployment environment and IAM session
 * to the generated client, and the locale bridge. It imports no other feature
 * plugin and exports no value the cordis loader does not need.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the settings slot declarations (settings.certificates).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.env into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
// Type-only: pulls ctx.iam into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { CertificateModal, type CertificateModalInjected } from './CertificateModal.tsx'
import { mountCertificateHost } from './certificateHost.ts'
import { en, NS, zh, type CertificateKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork certificate management plugin copy. */
    certificate: CertificateKey
  }
}

/** Services required by the plugin: slot registration, copy, and the host faces. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Client plugin body: register the dictionaries, mount the host adapter, and
 * contribute the certificate dialog to the settings-menu shell.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-certificate: dictionaries')

  const env = ctx.get('env') as EnvService
  const iam = ctx.get('iam') as IamService
  const host = mountCertificateHost({ env, iam })
  ctx.effect(() => () => { host.dispose() }, 'ui-sdkwork-certificate: SDKWork deployments host adapter')

  ctx.slots.inject('settings.certificates', () => ctx.slots.register({
    name: 'settings.certificates',
    locale: NS,
    inject: (): CertificateModalInjected => ({
      host,
      startSignIn: () => { iam.startSignIn() },
      hooks: {
        // Readiness is the adapter's, so an environment switch re-evaluates the
        // notice and the workspace without the row unmounting.
        available: {
          getSnapshot: () => host.readReady(),
          subscribe: listener => host.subscribe(listener),
        },
        // The sign-in gate reads the shared IAM controller: a successful login
        // (from the dialog's own action or anywhere else) swaps the prompt for
        // the ledger in place.
        signedIn: {
          getSnapshot: () => iam.isSignedIn(),
          subscribe: listener => iam.controller.subscribe(listener),
        },
        // Environment switches keep readiness true while the generated client
        // must be rebuilt; the revision is the dialog's re-read trigger.
        revision: {
          getSnapshot: () => host.readRevision(),
          subscribe: listener => host.subscribe(listener),
        },
      },
    }),
  }, CertificateModal))
}
