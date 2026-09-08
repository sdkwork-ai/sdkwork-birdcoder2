/** `apikey` namespace dictionaries for the SDKWork API key management plugin. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'apikey'

/** Union of dictionary keys (the Chinese file is the source of truth). */
export type ApiKeyKey = keyof typeof zh

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': 'API Key 管理',
  'section.title': 'API Key 管理',
  'section.description': '管理 Cloud Router 网关的 API Key：创建、编辑、删除与用量查看。',
  'section.notConfigured': '尚未配置 SDKWork 网关地址，无法加载 API Key 管理。',
  'close': '关闭',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<ApiKeyKey, string> = {
  'nav': 'API Key Management',
  'section.title': 'API Key Management',
  'section.description': 'Manage Cloud Router gateway API keys: create, edit, delete, and inspect usage.',
  'section.notConfigured': 'The SDKWork gateway origin is not configured; API key management is unavailable.',
  'close': 'Close',
}
