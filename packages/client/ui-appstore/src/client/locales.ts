/** `appstore` namespace dictionaries: the rail entry copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.appstore': '应用商店',
  'mode.appstore.label': '应用商店模式',
} satisfies Record<string, string>

/** The appstore namespace key union. */
export type AppStoreKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.appstore': 'App Store',
  'mode.appstore.label': 'App Store mode',
} satisfies Record<AppStoreKey, string>
