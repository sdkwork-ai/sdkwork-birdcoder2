/** Host registration for the ui-env settings section. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { UI_ENV_NAMESPACE, UiEnvSettingsSchema } from './env-settings.ts'

export {
  UI_ENV_ENVIRONMENT_FIELD, UI_ENV_NAMESPACE, UiEnvSettingsSchema,
  type SdkworkEnvProfile, type SdkworkEnvironment, type UiEnvSettings,
} from './env-settings.ts'

/**
 * Register the durable ui-env section when the settings service is composed
 * (the browser scope binds the same namespace).
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(UI_ENV_NAMESPACE), UiEnvSettingsSchema)
  })
}
