import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AppHeaderKey } from './locales.ts'

/** Non-code modes that render beneath the shared app header. */
export type AppHeaderMode = Exclude<AppModeId, 'code'>

/** Which OS's window-control conventions the header reserves space for. */
export type AppHeaderPlatform = 'win32' | 'darwin' | 'linux' | 'other'

/**
 * Map a Chromium platform identifier to the supported window-control metrics.
 * @param raw - the platform string, e.g. "Win32", "MacIntel", "Linux x86_64".
 * @returns the convention set; unknown strings fall back to the default.
 */
export function resolvePlatform(raw: string): AppHeaderPlatform {
  const platform = raw.toLowerCase()
  if (platform === 'darwin' || platform.includes('mac')) return 'darwin'
  if (platform === 'win32' || platform.startsWith('win')) return 'win32'
  if (platform.includes('linux')) return 'linux'
  return 'other'
}

/**
 * Resolve the host OS's window-control convention set from Chromium's
 * user-agent platform, falling back to `navigator.platform`.
 * @returns the convention set; unknown or absent platforms fall back to the default.
 */
export function platformOf(): AppHeaderPlatform {
  const navigatorLike = (globalThis as {
    navigator?: { platform?: string; userAgentData?: { platform?: string } }
  }).navigator
  const raw = navigatorLike?.userAgentData?.platform ?? navigatorLike?.platform
  return resolvePlatform(raw ?? '')
}

/** Locale key for each non-code mode title. */
const MODE_TITLE_KEYS: Record<AppHeaderMode, AppHeaderKey> = {
  work: 'mode.work',
  video: 'mode.video',
  image: 'mode.image',
  appstore: 'mode.appstore',
  knowledge: 'mode.knowledge',
  drive: 'mode.drive',
  assets: 'mode.assets',
  account: 'mode.account',
  'token-plan': 'mode.tokenPlan',
}

/**
 * Resolve the locale key for a mode's title in the shared app header.
 * @param mode - the active non-code mode id.
 * @returns the dictionary key under the `appHeader` namespace.
 */
export function titleKeyForMode(mode: AppHeaderMode): AppHeaderKey {
  return MODE_TITLE_KEYS[mode]
}
