/** `appstore` namespace dictionaries: the rail entry copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.appstore': '应用商店',
  'mode.appstore.label': '应用商店模式',
  'auth.required.title': '登录后使用应用商店',
  'auth.required.detail': '应用商店需要登录后才能浏览和安装应用。',
  'auth.required.action': '登录',
} satisfies Record<string, string>

/** The appstore namespace key union. */
export type AppStoreKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.appstore': 'App Store',
  'mode.appstore.label': 'App Store mode',
  'auth.required.title': 'Sign in to use the App Store',
  'auth.required.detail': 'Sign in to browse and install applications.',
  'auth.required.action': 'Sign in',
} satisfies Record<AppStoreKey, string>
