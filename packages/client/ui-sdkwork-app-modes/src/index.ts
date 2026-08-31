/** Host registration for the app-mode surface preferences. */

import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Validate a settings namespace key and return it branded; malformed names
 * throw TypeError (the dsh-settings public API no longer exports a brand
 * function, so this package keeps its own).
 * @param value - candidate namespace key.
 * @returns the key branded as {@link SettingsNamespace}.
 */
export function settingsNamespace(value: string): SettingsNamespace {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`)
  }
  return value as SettingsNamespace
}
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
