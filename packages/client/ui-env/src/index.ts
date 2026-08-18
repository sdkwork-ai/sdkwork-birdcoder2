/** Host registration for the ui-env settings section. */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { projectSdkworkEnvBase } from './env-projection.ts'
import { UI_ENV_NAMESPACE, UiEnvSettingsSchema } from './env-settings.ts'

export {
  UI_ENV_ENVIRONMENT_FIELD, UI_ENV_NAMESPACE, UiEnvSettingsSchema,
  type SdkworkEnvProfile, type SdkworkEnvironment, type UiEnvSettings,
} from './env-settings.ts'
export { projectSdkworkEnvBase, resolveUiEnvEnvironment, SDKWORK_BASE_URL_KEYS } from './env-projection.ts'

/**
 * Register the durable ui-env section when the settings service is composed
 * (the browser scope binds the same namespace). The registration carries the
 * launch-environment projection as its composition `base` layer, so the
 * active environment's base URL and bootstrap access token flow from the
 * env files into every SDKWork integration plugin through `ctx.env`, while a
 * user-edited settings document still overrides them.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(UI_ENV_NAMESPACE),
      UiEnvSettingsSchema,
      { base: projectSdkworkEnvBase(launchEnvironmentOf(ctx)) },
    )
  })
}
