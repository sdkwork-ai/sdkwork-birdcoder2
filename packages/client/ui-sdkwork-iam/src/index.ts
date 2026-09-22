/** Host registration for the ui-sdkwork-iam settings section. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

import {
  UI_IAM_OAUTH_LOGIN_FIELD, UI_IAM_PRESENTATION_FIELD, UI_IAM_QR_LOGIN_FIELD,
  UiIamSettingsFields, type UiIamPresentation,
} from './iam-settings.ts'

export {
  UI_IAM_NAMESPACE, UI_IAM_OAUTH_LOGIN_FIELD,
  UI_IAM_PRESENTATION_FIELD, UI_IAM_QR_LOGIN_FIELD, UiIamSettingsSchema,
  type UiIamPresentation, type UiIamSettings,
} from './iam-settings.ts'

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

/**
 * Runtime IAM presentation toggles projected to the browser.
 *
 * A plugin's own Config *is* its settings section: the Loader creates the
 * entry from the composition, and `volatile` is what keeps the fields live —
 * the browser half binds the same namespace through `configForms`.
 */
export interface Config {
  /** How the settings-menu sign-in opens: full-page account mode or the modal. */
  presentation: Volatile<UiIamPresentation>
  /** Whether the auth page offers QR-code login. */
  qrLoginEnabled: Volatile<boolean>
  /** Whether the auth page offers OAuth provider login. */
  oauthLoginEnabled: Volatile<boolean>
}

/** Live ui-sdkwork-iam presentation toggles. */
export const Config = z.object({
  [UI_IAM_PRESENTATION_FIELD]: UiIamSettingsFields[UI_IAM_PRESENTATION_FIELD].volatile(),
  [UI_IAM_QR_LOGIN_FIELD]: UiIamSettingsFields[UI_IAM_QR_LOGIN_FIELD].volatile(),
  [UI_IAM_OAUTH_LOGIN_FIELD]: UiIamSettingsFields[UI_IAM_OAUTH_LOGIN_FIELD].volatile(),
})

/**
 * Keep the ui-sdkwork-iam section out of the shell's generated settings pages
 * — the account surface renders these toggles itself — while the section stays
 * in the profile-backed forms the browser scope reads.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
