/**
 * SDKWork IAM integration plugin, browser half: provides the `ctx.iam`
 * service (auth controller over the generated app client + settings mirror
 * + presentation dispatch), binds the settings-menu account seam to the IAM
 * session (`ctx.account.setSource`), registers the account app mode (rail
 * entry + full-page auth page), and hosts the modal sign-in surface on the
 * frame's floating overlay. The `ui-sdkwork-iam` settings scope (base URL, app id,
 * presentation, QR/OAuth toggles) lands from the Host settings document.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail seat + mode.page slot declarations.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
// Type-only: pulls the shell.overlay slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.configForms into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.account (the settings-menu seam) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { AccountRuntime } from '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
// Type-only: pulls ctx.env into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls ctx.theme into this program.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { readOemShowApiKeyEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { UI_IAM_NAMESPACE, type UiIamSettings } from '../iam-settings.ts'
import { createIamAccountSource } from './account-source.ts'
import { createIamUiStore } from './iam-ui-store.ts'
import { IamService } from './iam-service.ts'
import { AccountModePage, toSdkworkLocale, type AccountModePageInjected } from './AccountModePage.tsx'
import { readDesktopSignInPage } from './desktop-sign-in-page.ts'
import { SignInOverlay, type SignInOverlayInjected } from './SignInOverlay.tsx'
import { en, zh, type UiIamKey } from './locales.ts'

export {
  AuthenticatedModeShell,
  type AuthenticatedModeShellProps,
} from './AuthenticatedModeShell.tsx'
export {
  AuthenticatedSdkworkModePage,
  type AuthenticatedSdkworkModePageInjected,
  type AuthenticatedSdkworkModePageProps,
} from './AuthenticatedSdkworkModePage.tsx'
export {
  injectAuthenticatedModePage,
  type AuthenticatedModeGate,
} from './authenticated-mode.ts'
export {
  createSignInRequestInterceptor,
  isUserInitiatedRequest,
  requiresSignedInSession,
  SdkworkSignInRequiredError,
  type SignInRequirementRule,
  type SdkworkSignInRequirement,
} from './sign-in-requirement.ts'
export { IamService } from './iam-service.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ui-sdkwork-iam plugin's copy (rail entry, account page, modal host). */
    uiIam: UiIamKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'uiIam'

/** Services required by the ui-sdkwork-iam plugin (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms', 'layout', 'account', 'env', 'theme']

/**
 * Register the ui-sdkwork-iam dictionaries, the IAM service, the account seam
 * binding, the account mode, and the modal host, each once its slot
 * declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-iam: dictionaries')

  const scope = ctx.configForms.get<UiIamSettings>(UI_IAM_NAMESPACE)
  const layout = ctx.get('layout') as ILayout
  const account = ctx.get('account') as AccountRuntime
  const env = ctx.get('env') as EnvService
  const theme = ctx.get('theme') as ThemeRuntime
  const localeOf = (): string => toSdkworkLocale(ctx.locale.getSnapshot().active)

  const service = new IamService(scope, env, layout)
  ctx.provide('iam', service)
  // The service owns the desktop login flow's deep-link listener and timer; a
  // reloaded plugin must release them instead of leaving a second listener
  // that answers the same callback.
  ctx.effect(() => () => { service.dispose() }, 'ui-sdkwork-iam: service teardown')
  account.setSource(createIamAccountSource(service))

  // Restore a stored session once the environment reports a base URL. Retries
  // until the controller finishes bootstrap so a late env projection or a
  // transient validation failure does not strand the user signed out. The
  // welcome's one-shot sign-in request is answered only after restore settles:
  // an already signed-in launch must not raise the login surface.
  let restoring: Promise<void> | undefined
  const tryBootstrap = (): void => {
    if (!service.isConfigured()) return
    const answerPending = (): void => { void service.startPendingSignIn() }
    if (service.controller.getState().isBootstrapped) { answerPending(); return }
    // One restore at a time: an environment change during bootstrap joins it.
    const pending = restoring ?? service.bootstrap()
    restoring = pending
    const settle = (): void => {
      if (restoring === pending) restoring = undefined
      answerPending()
    }
    void pending.then(settle, settle)
  }
  tryBootstrap()
  ctx.effect(() => env.subscribe(tryBootstrap), 'ui-sdkwork-iam: session bootstrap')

  // The modal open/close actions bound by the overlay registration; the
  // service dispatches through them from the settings-menu sign-in gesture.
  const uiStore = createIamUiStore()
  let boundModal: BoundActions<typeof uiStore> | undefined
  service.attachModal({
    openEntry: () => { boundModal?.openEntry() },
    openLogin: () => { boundModal?.openLogin() },
    openBrowser: () => { boundModal?.openBrowser() },
    close: () => { boundModal?.closeModal() },
  })
  // Answer a pending welcome request now that the overlay can mount; the call
  // is a no-op once the request was consumed or no session restore is pending.
  tryBootstrap()

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
        onClose: () => { service.dismissSignIn() },
        // The entry's Sign in runs the configured gesture: the browser
        // hand-off by default, the in-app method form when configured.
        onStartLogin: () => { service.startSignIn() },
        // The quiet link under the column, shown only while Sign in hands off
        // to the browser: the old in-app login form stays one gesture away.
        onStartInAppLogin: () => { service.openSignInMethods() },
        onRetryBrowser: () => { service.startBrowserSignIn() },
        // A plain browser page has no key page to open, and the deployment
        // keeps the API-key fallback hidden unless it opts in.
        ...readDesktopSignInPage() === undefined || !readOemShowApiKeyEntry()
          ? {}
          : { startApiKey: () => { void service.openApiKeyPage() } },
        locale: localeOf(),
        runtimeConfig: service.authRuntimeConfig(),
        hooks: {
          configured: {
            getSnapshot: () => service.isConfigured(),
            subscribe: listener => service.subscribe(listener),
          },
          theme: {
            getSnapshot: () => theme.getTheme(),
            subscribe: listener => ctx.on('theme/change', listener),
          },
          browserFailed: {
            getSnapshot: () => service.browserSignInFailed(),
            subscribe: listener => service.subscribe(listener),
          },
          browserFailure: {
            getSnapshot: () => service.browserSignInFailure(),
            subscribe: listener => service.subscribe(listener),
          },
          browserHandoff: {
            getSnapshot: () => service.usesBrowserHandoff(),
            subscribe: listener => service.subscribe(listener),
          },
        },
      }
    },
  }, SignInOverlay))
}
