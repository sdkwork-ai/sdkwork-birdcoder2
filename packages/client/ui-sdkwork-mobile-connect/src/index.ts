/**
 * Mobile connection surface, Host half. Declaring `Config` is what makes the
 * `ui-sdkwork-mobile-connect` settings namespace exist: the Loader creates the
 * entry from the composition, and the volatile fields are the live section the
 * browser scope reads and writes. The generated settings page stays off — the
 * rail shortcut's hover card owns this preference, so the shell never offers a
 * second, differently shaped copy of it.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
// Type-only: pulls ctx.settings (the Host settings provider) into this program.
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

import {
  APP_DOWNLOAD_URL_FIELD, MINI_PROGRAM_URL_FIELD, REMOTE_ACCESS_FIELD, MobileConnectSettingsFields,
} from './settings.ts'

export {
  APP_DOWNLOAD_URL_FIELD, DEFAULT_APP_DOWNLOAD_URL, DEFAULT_MINI_PROGRAM_URL, MINI_PROGRAM_URL_FIELD,
  MOBILE_CONNECT_NAMESPACE, MobileConnectSettingsFields, MobileConnectSettingsSchema, REMOTE_ACCESS_FIELD,
  type MobileConnectSettings,
} from './settings.ts'

/** Live mobile-connection preferences, as the Host resolves them for the browser scope. */
export interface Config {
  /** Whether this installation offers mobile devices a remote connection. */
  remoteAccessEnabled: Volatile<boolean>
  /** Page the App tab's QR code opens. */
  appDownloadUrl: Volatile<string>
  /** Page the mini-program tab's QR code opens. */
  miniProgramUrl: Volatile<string>
}

/** Host schema for the namespace; every field is volatile so the browser sees live updates. */
export const Config = z.object({
  [REMOTE_ACCESS_FIELD]: MobileConnectSettingsFields[REMOTE_ACCESS_FIELD].volatile(),
  [APP_DOWNLOAD_URL_FIELD]: MobileConnectSettingsFields[APP_DOWNLOAD_URL_FIELD].volatile(),
  [MINI_PROGRAM_URL_FIELD]: MobileConnectSettingsFields[MINI_PROGRAM_URL_FIELD].volatile(),
})

/**
 * Keep this namespace out of the shell's generated settings pages.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
