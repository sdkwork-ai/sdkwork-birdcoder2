/** `sdkworkConversationHeader` namespace dictionaries for the header plugin. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sdkworkConversationHeader'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'header.viewsAria': '会话视图切换',
}

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<HeaderKey, string> = {
  'header.viewsAria': 'Conversation views',
}

/** Locale key union for the plugin's namespace. */
export type HeaderKey = keyof typeof zh
