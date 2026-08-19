/**
 * SDKWork feedback integration plugin, browser half: provides the feedback
 * channel over the appstore feedback collector (`ctx.feedback.setSource` on
 * the settings-menu seam) and hosts the feedback dialog on the frame's
 * floating overlay. The collector base URL, app key, and static access
 * token come from the shared ui-env profile; session tokens flow from the
 * mounted ui-iam controller merged with the env access token through the
 * shared SDKWork token manager. Without either, submissions reach the
 * submissions reach the collector's auth wall and surface its error.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the shell.overlay slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.feedback (the settings-menu seam) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings-menu/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.env (the shared deployment environment) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import type { FeedbackRuntime, FeedbackSource } from '@deepseek-ai/dsh-client-ui-settings-menu/client'
import { FeedbackService, type IamServiceLike } from './feedback-service.ts'
import { createFeedbackUiStore } from './feedback-ui-store.ts'
import { FeedbackDialog, type FeedbackDialogInjected } from './FeedbackDialog.tsx'
import { en, zh, type UiFeedbackKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ui-feedback plugin's copy (dialog form and states). */
    uiFeedback: UiFeedbackKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'uiFeedback'

/** Services required by the ui-feedback plugin (cordis fiber inject). */
export const inject = ['slots', 'locale', 'feedback', 'env']

/**
 * The settings-menu feedback seam source: availability follows the shared
 * environment (the row appears once a base URL is configured) and the open
 * gesture dispatches through the service's bound dialog actions. The snapshot
 * stays a stable reference until availability actually moves (uSES contract —
 * a fresh object per read would re-render the menu forever).
 */
function createFeedbackSource(
  service: FeedbackService,
  env: EnvService,
): FeedbackSource {
  let lastProfile: { available: boolean } | undefined
  return {
    getSnapshot: () => {
      const available = service.isConfigured()
      if (lastProfile === undefined || lastProfile.available !== available) {
        lastProfile = { available }
      }
      return lastProfile
    },
    subscribe: listener => env.subscribe(listener),
    open: () => { service.open() },
  }
}

/**
 * Register the ui-feedback dictionaries, the feedback service, the
 * settings-menu seam binding, and the dialog host, each once its slot
 * declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-feedback: dictionaries')

  // The IAM service is optional: absent (no ui-iam mount) submissions still
  // flow, carrying only the configured env access token (or none).
  const env = ctx.get('env') as EnvService
  const iam = ctx.get('iam') as IamServiceLike | undefined
  const service = new FeedbackService(env, iam)
  ctx.effect(() => service.subscribeIam(), 'ui-feedback: iam token sync')

  const feedback = ctx.get('feedback') as FeedbackRuntime
  feedback.setSource(createFeedbackSource(service, env))

  // The dialog open/close actions bound by the overlay registration; the
  // service dispatches through them from the settings-menu feedback row.
  const uiStore = createFeedbackUiStore()
  let boundModal: BoundActions<typeof uiStore> | undefined
  service.attachModal({
    open: () => { boundModal?.openDialog() },
    close: () => { boundModal?.closeDialog() },
  })

  // The feedback dialog on the frame's floating layer: renders while the
  // shared store says open, nothing otherwise (the layer stays click-through).
  // Unconfigured it renders the configuration notice, so the settings-menu
  // gesture always lands in a dialog.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'feedback',
    locale: NS,
    store: uiStore,
    inject: (actions): FeedbackDialogInjected => {
      boundModal = actions
      return {
        service,
        onClose: () => { actions.closeDialog() },
        hooks: {
          configured: {
            getSnapshot: () => service.isConfigured(),
            subscribe: listener => env.subscribe(listener),
          },
        },
      }
    },
  }, FeedbackDialog))
}
