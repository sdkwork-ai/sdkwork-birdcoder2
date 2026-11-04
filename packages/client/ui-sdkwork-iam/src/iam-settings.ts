/** SDKWork IAM integration settings stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-sdkwork-iam plugin. */
export const UI_IAM_NAMESPACE = 'ui-sdkwork-iam'

/** Field carrying the sign-in presentation in the ui-sdkwork-iam section. */
export const UI_IAM_PRESENTATION_FIELD = 'presentation'
/** Field carrying the login gesture's flow in the ui-sdkwork-iam section. */
export const UI_IAM_SIGN_IN_METHOD_FIELD = 'signInMethod'
/** Field carrying the QR-login toggle in the ui-sdkwork-iam section. */
export const UI_IAM_QR_LOGIN_FIELD = 'qrLoginEnabled'
/** Field carrying the OAuth-login toggle in the ui-sdkwork-iam section. */
export const UI_IAM_OAUTH_LOGIN_FIELD = 'oauthLoginEnabled'

/** How the settings-menu sign-in gesture presents the auth surface. */
export type UiIamPresentation = 'page' | 'modal'

/**
 * What the product login panel's Sign in button starts:
 *
 * - `browser` — open the hosted authorization page in the system browser and
 *   return through the desktop deep link (the default). Requires the tenant
 *   application to carry its OAuth relying-party registration.
 * - `modal` — raise the in-app account method form without leaving the app.
 *   The opt-out for a deployment whose tenant has not registered the client.
 */
export type UiIamSignInMethod = 'browser' | 'modal'

/**
 * Durable ui-sdkwork-iam section shared by the Host schema and the browser scope.
 * The IAM base URL and tenant application id come from the shared ui-sdkwork-env
 * profile (see @deepseek-ai/dsh-client-ui-sdkwork-env), so a deployment switches
 * environments in one place instead of per-plugin settings.
 */
export interface UiIamSettings {
  /** How the settings-menu sign-in opens: full-page account mode or the modal. */
  presentation: UiIamPresentation
  /** What the login panel's Sign in button starts: the in-app form or the system browser. */
  signInMethod: UiIamSignInMethod
  /** Whether the auth page offers QR-code login. */
  qrLoginEnabled: boolean
  /** Whether the auth page offers OAuth provider login. */
  oauthLoginEnabled: boolean
}

/**
 * Durable ui-sdkwork-iam fields, shared by the Host Config (which marks them
 * volatile so the browser scope can read them) and the wire envelope below.
 */
export const UiIamSettingsFields = {
  [UI_IAM_PRESENTATION_FIELD]: z.union([z.const('page'), z.const('modal')]).default('modal'),
  // Sign in leaves the app for the tenant's hosted login page: the product's
  // browser-login gesture. The tenant application must carry its OAuth
  // relying-party registration (`oauth.relyingParty`), which the app manifest
  // declares and the tenant applies; a deployment that has not done so sets
  // `modal` instead of sending users to an unregistered-client error page.
  [UI_IAM_SIGN_IN_METHOD_FIELD]: z.union([z.const('browser'), z.const('modal')]).default('browser'),
  // QR sign-in is the desktop product's primary entry, so a fresh profile
  // offers it; a deployment or user can still switch it off.
  [UI_IAM_QR_LOGIN_FIELD]: z.boolean().default(true),
  [UI_IAM_OAUTH_LOGIN_FIELD]: z.boolean().default(false),
}

/** Durable ui-sdkwork-iam schema; also the wire envelope the browser scope validates against. */
export const UiIamSettingsSchema: z<UiIamSettings> = z.object(UiIamSettingsFields)

/** The schema defaults, for reads before the settings scope resolves. */
export const DEFAULT_UI_IAM_SETTINGS: UiIamSettings = {
  [UI_IAM_PRESENTATION_FIELD]: 'modal',
  [UI_IAM_SIGN_IN_METHOD_FIELD]: 'browser',
  [UI_IAM_QR_LOGIN_FIELD]: true,
  [UI_IAM_OAUTH_LOGIN_FIELD]: false,
}
