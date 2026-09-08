/** `appstore` namespace dictionaries: the rail entry copy and surface faces. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.appstore': '应用商店',
  'mode.appstore.label': '应用商店模式',
  'surface.unconfigured.title': '应用商店尚未配置',
  'surface.unconfigured.detail': '网关未配置，暂无法加载应用商店。',
  'surface.error.title': '应用商店加载失败',
  'surface.error.detail': '嵌入式应用商店出现异常，请重试。',
  'surface.error.retry': '重试',
} satisfies Record<string, string>

/** The appstore namespace key union. */
export type AppStoreKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.appstore': 'App Store',
  'mode.appstore.label': 'App Store mode',
  'surface.unconfigured.title': 'App Store is not configured',
  'surface.unconfigured.detail': 'The gateway is not configured, so the App Store cannot load.',
  'surface.error.title': 'App Store failed to load',
  'surface.error.detail': 'The embedded App Store hit an error. Please retry.',
  'surface.error.retry': 'Retry',
} satisfies Record<AppStoreKey, string>
