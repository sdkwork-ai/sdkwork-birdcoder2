import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AppHeaderKey } from './locales.ts'

/** Non-code modes: every mode whose page the shell titles itself. */
export type WindowTitleMode = Exclude<AppModeId, 'code'>

/** Locale key for each non-code mode title. */
const MODE_TITLE_KEYS: Record<WindowTitleMode, AppHeaderKey> = {
  work: 'mode.work',
  'pull-request': 'mode.pullRequest',
  automation: 'mode.automation',
  video: 'mode.video',
  image: 'mode.image',
  document: 'mode.document',
  appstore: 'mode.appstore',
  knowledge: 'mode.knowledge',
  course: 'mode.course',
  drive: 'mode.drive',
  markets: 'mode.markets',
  assets: 'mode.assets',
  account: 'mode.account',
  'token-plan': 'mode.tokenPlan',
}

/**
 * Resolve the locale key naming one mode in the host window's title.
 * @param mode - the active non-code mode id.
 * @returns the dictionary key under the `appHeader` namespace.
 */
export function titleKeyForMode(mode: WindowTitleMode): AppHeaderKey {
  return MODE_TITLE_KEYS[mode]
}
