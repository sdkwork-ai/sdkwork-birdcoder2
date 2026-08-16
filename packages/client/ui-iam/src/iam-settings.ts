/** SDKWork IAM integration settings stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-iam plugin. */
export const UI_IAM_NAMESPACE = 'ui-iam'

/** Field carrying the sign-in presentation in the ui-iam section. */
export const UI_IAM_PRESENTATION_FIELD = 'presentation'
/** Field carrying the QR-login toggle in the ui-iam section. */
export const UI_IAM_QR_LOGIN_FIELD = 'qrLoginEnabled'
/** Field carrying the OAuth-login toggle in the ui-iam section. */
export const UI_IAM_OAUTH_LOGIN_FIELD = 'oauthLoginEnabled'

/** How the settings-menu sign-in gesture presents the auth surface. */
export type UiIamPresentation = 'page' | 'modal'

/**
 * Durable ui-iam section shared by the Host schema and the browser scope.
 * The IAM base URL and tenant application id come from the shared ui-env
 * profile (see @deepseek-ai/dsh-client-ui-env), so a deployment switches
 * environments in one place instead of per-plugin settings.
 */
export interface UiIamSettings {
  /** How the settings-menu sign-in opens: full-page account mode or the modal. */
  presentation: UiIamPresentation
  /** Whether the auth page offers QR-code login. */
  qrLoginEnabled: boolean
  /** Whether the auth page offers OAuth provider login. */
  oauthLoginEnabled: boolean
}

/** Durable ui-iam schema; also the wire envelope the browser scope validates against. */
export const UiIamSettingsSchema: z<UiIamSettings> = z.object({
  [UI_IAM_PRESENTATION_FIELD]: z.union([z.const('page'), z.const('modal')]).default('modal'),
  [UI_IAM_QR_LOGIN_FIELD]: z.boolean().default(false),
  [UI_IAM_OAUTH_LOGIN_FIELD]: z.boolean().default(false),
})

/** The schema defaults, for reads before the settings scope resolves. */
export const DEFAULT_UI_IAM_SETTINGS: UiIamSettings = {
  [UI_IAM_PRESENTATION_FIELD]: 'modal',
  [UI_IAM_QR_LOGIN_FIELD]: false,
  [UI_IAM_OAUTH_LOGIN_FIELD]: false,
}
