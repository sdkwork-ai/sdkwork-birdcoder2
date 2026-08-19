/** `generationsAssets` namespace dictionaries: the rail entry only. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.assets': '资产',
  'mode.assets.label': '资产模式',
  'auth.required.title': '登录后使用资产',
  'auth.required.detail': '资产库需要登录后才能浏览和管理你的生成资产。',
  'auth.required.action': '登录',
} satisfies Record<string, string>

/** The generationsAssets namespace key union. */
export type AssetsGenerationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.assets': 'Assets',
  'mode.assets.label': 'Assets mode',
  'auth.required.title': 'Sign in to use Assets',
  'auth.required.detail': 'Sign in to browse and manage your generated assets.',
  'auth.required.action': 'Sign in',
} satisfies Record<AssetsGenerationsKey, string>
