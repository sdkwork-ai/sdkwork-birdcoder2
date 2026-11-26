/**
 * The mobile-connection surface's durable preferences: one settings namespace
 * holding the two scan destinations and the allow-remote-connection switch.
 * The Host Config schema and the browser scope validate the same fields, so a
 * section the browser writes is the section the Host resolves.
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by this plugin; also its profile entry id. */
export const MOBILE_CONNECT_NAMESPACE = 'ui-sdkwork-mobile-connect'

/** Field carrying the "allow mobile devices to connect remotely" preference. */
export const REMOTE_ACCESS_FIELD = 'remoteAccessEnabled'

/** Field carrying the page the mobile App tab's QR code opens. */
export const APP_DOWNLOAD_URL_FIELD = 'appDownloadUrl'

/** Field carrying the page the WeChat mini-program tab's QR code opens. */
export const MINI_PROGRAM_URL_FIELD = 'miniProgramUrl'

/** Shipped mobile App download page (the application root the mobile clients publish under). */
export const DEFAULT_APP_DOWNLOAD_URL = 'https://sdkwork.com/apps/sdkwork-birdcoder2'

/** Shipped WeChat mini-program page. */
export const DEFAULT_MINI_PROGRAM_URL = 'https://sdkwork.com/apps/sdkwork-birdcoder2-mini-program'

/** Durable mobile-connection preferences. */
export interface MobileConnectSettings {
  /** Whether this installation offers mobile devices a remote connection. */
  remoteAccessEnabled: boolean
  /** Page the App tab's QR code opens; an empty string shows the unconfigured state. */
  appDownloadUrl: string
  /** Page the mini-program tab's QR code opens; an empty string shows the unconfigured state. */
  miniProgramUrl: string
}

/** Field schemas shared by the Host Config and the browser scope's wire validation. */
export const MobileConnectSettingsFields = {
  [REMOTE_ACCESS_FIELD]: z.boolean().default(true),
  [APP_DOWNLOAD_URL_FIELD]: z.string().default(DEFAULT_APP_DOWNLOAD_URL),
  [MINI_PROGRAM_URL_FIELD]: z.string().default(DEFAULT_MINI_PROGRAM_URL),
}

/** Durable mobile-connection schema; also the envelope the browser scope validates against. */
export const MobileConnectSettingsSchema: z<MobileConnectSettings> = z.object(MobileConnectSettingsFields)
