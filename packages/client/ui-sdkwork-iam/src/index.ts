/** Host registration for the ui-sdkwork-iam settings section. */

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
import { UI_IAM_NAMESPACE, UiIamSettingsSchema } from './iam-settings.ts'

export {
  UI_IAM_NAMESPACE, UI_IAM_OAUTH_LOGIN_FIELD,
  UI_IAM_PRESENTATION_FIELD, UI_IAM_QR_LOGIN_FIELD, UiIamSettingsSchema,
  type UiIamPresentation, type UiIamSettings,
} from './iam-settings.ts'

/**
 * Register the durable ui-sdkwork-iam section when the settings service is composed
 * (the browser scope binds the same namespace).
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(UI_IAM_NAMESPACE), UiIamSettingsSchema)
  })
}
