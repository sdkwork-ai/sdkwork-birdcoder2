/** `officialAccounts` namespace dictionaries for the SDKWork official-account plugin. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'officialAccounts'

/** Union of dictionary keys (the Chinese file is the source of truth). */
export type OfficialAccountsKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'section.title': '公众号账号',
  'section.description': '维护公众号账号配置，供公众号菜单管理与文章发布使用。',
  'section.notConfigured': '尚未配置 SDKWork 网关地址，无法加载公众号账号管理。',
  'section.signInRequired': '登录后可维护公众号账号配置。',
  'section.signIn': '登录 / 注册',
  'close': '关闭',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<OfficialAccountsKey, string> = {
  'section.title': 'Official Accounts',
  'section.description': 'Maintain official-account configuration for menu management and article publishing.',
  'section.notConfigured': 'The SDKWork gateway origin is not configured; official-account management is unavailable.',
  'section.signInRequired': 'Sign in to maintain official-account configuration.',
  'section.signIn': 'Sign in / Register',
  'close': 'Close',
}
