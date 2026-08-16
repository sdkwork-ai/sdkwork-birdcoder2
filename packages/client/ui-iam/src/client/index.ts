/**
 * SDKWork IAM integration plugin, browser half: provides the `ctx.iam`
 * service (auth controller over the generated app client + settings mirror
 * + presentation dispatch), binds the settings-menu account seam to the IAM
 * session (`ctx.account.setSource`), registers the account app mode (rail
 * entry + full-page auth page), and hosts the modal sign-in surface on the
 * frame's floating overlay. The `ui-iam` settings scope (base URL, app id,
 * presentation, QR/OAuth toggles) lands from the Host settings document.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail seat + mode.page slot declarations.
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
// Type-only: pulls the shell.overlay slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.settingsScope into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.account (the settings-menu seam) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings-menu/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { AccountRuntime } from '@deepseek-ai/dsh-client-ui-settings-menu/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
// Type-only: pulls ctx.env into this program.
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls ctx.theme into this program.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { UI_IAM_NAMESPACE, type UiIamSettings } from '../iam-settings.ts'
import { createIamAccountSource } from './account-source.ts'
import { createIamUiStore } from './iam-ui-store.ts'
import { IamService } from './iam-service.ts'
import { AccountModePage, toSdkworkLocale, type AccountModePageInjected } from './AccountModePage.tsx'
import { SignInOverlay, type SignInOverlayInjected } from './SignInOverlay.tsx'
import { en, zh, type UiIamKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ui-iam plugin's copy (rail entry, account page, modal host). */
    uiIam: UiIamKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'uiIam'

/** Services required by the ui-iam plugin (cordis fiber inject). */
export const inject = ['slots', 'locale', 'settingsScope', 'layout', 'account', 'env', 'theme']

/**
 * Register the ui-iam dictionaries, the IAM service, the account seam
 * binding, the account mode, and the modal host, each once its slot
 * declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-iam: dictionaries')

  const scope = ctx.settingsScope.bind<UiIamSettings>({ namespace: UI_IAM_NAMESPACE })
  const layout = ctx.get('layout') as ILayout
  const account = ctx.get('account') as AccountRuntime
  const env = ctx.get('env') as EnvService
  const theme = ctx.get('theme') as ThemeRuntime
  const localeOf = (): string => toSdkworkLocale(ctx.locale.getSnapshot().active)

  const service = new IamService(scope, env, layout)
  ctx.provide('iam', service)
  account.setSource(createIamAccountSource(service))

  // Restore a stored session once the settings scope resolves with a
  // configured environment (the bootstrap itself no-ops while unconfigured;
  // an unconfigured boot retries on the next environment or settings move).
  let bootstrapped = false
  const tryBootstrap = (): void => {
    if (bootstrapped) return
    if (!service.isConfigured()) return
    bootstrapped = true
    void service.bootstrap()
  }
  tryBootstrap()
  ctx.effect(() => env.subscribe(tryBootstrap), 'ui-iam: session bootstrap')

  // The modal open/close actions bound by the overlay registration; the
  // service dispatches through them from the settings-menu sign-in gesture.
  const uiStore = createIamUiStore()
  let boundModal: BoundActions<typeof uiStore> | undefined
  service.attachModal({
    open: () => { boundModal?.openModal() },
    close: () => { boundModal?.closeModal() },
  })

  // The account mode page: full-page auth while signed out, the account
  // summary while signed in, the config notice while unconfigured.
  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'account',
    locale: NS,
    inject: (): AccountModePageInjected => ({
      mode: 'account',
      controller: service.controller,
      runtimeConfig: service.authRuntimeConfig(),
      onSignOut: () => { void service.controller.signOut() },
      locale: localeOf(),
      hooks: {
        available: {
          getSnapshot: () => service.isConfigured(),
          subscribe: listener => service.subscribe(listener),
        },
        authState: {
          getSnapshot: () => service.controller.getState(),
          subscribe: listener => service.controller.subscribe(listener),
        },
        theme: {
          getSnapshot: () => theme.getTheme(),
          subscribe: listener => ctx.on('theme/change', listener),
        },
      },
    }),
  }, AccountModePage))

  // The modal sign-in host on the frame's floating layer: renders while the
  // shared store says open, nothing otherwise (the layer stays click-through).
  // Unconfigured it renders the configuration notice, so the settings-menu
  // gesture always lands in a dialog.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'iam-sign-in',
    locale: NS,
    store: uiStore,
    inject: (actions): SignInOverlayInjected => {
      boundModal = actions
      return {
        controller: service.controller,
        onClose: () => { actions.closeModal() },
        locale: localeOf(),
        hooks: {
          configured: {
            getSnapshot: () => service.isConfigured(),
            subscribe: listener => service.subscribe(listener),
          },
          theme: {
            getSnapshot: () => theme.getTheme(),
            subscribe: listener => ctx.on('theme/change', listener),
          },
        },
      }
    },
  }, SignInOverlay))
}
