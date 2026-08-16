/** Host registration for the app-mode surface preferences. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { UI_APP_MODES_NAMESPACE, UiAppModesSettingsSchema } from './app-modes-settings.ts'

export {
  SIDEBAR_VISIBLE_FIELD, UI_APP_MODES_NAMESPACE, UiAppModesSettingsSchema,
  type UiAppModesSettings,
} from './app-modes-settings.ts'

/**
 * Register the durable app-mode surface section when the settings service is
 * composed (the browser scope binds the same namespace).
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(UI_APP_MODES_NAMESPACE), UiAppModesSettingsSchema)
  })
}
