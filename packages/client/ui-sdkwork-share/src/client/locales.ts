/** `share` namespace dictionaries for the SDKWork share plugin. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'share'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'share.aria': '分享',
  'share.title': '分享',
  'share.popover': '分享',
  'share.session': '当前会话',
  'share.copySessionId': '复制会话 ID',
  'share.copied': '已复制',
  'share.copyFailed': '复制失败：{message}',
  'share.recentApps': '最近发布的应用',
  'share.copyAppId': '复制应用 ID',
  'share.appsUnavailable': '发布服务暂不可用，无法列出应用。',
  'share.appsEmpty': '还没有发布过的应用。',
  'share.loading': '加载中…',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<ShareKey, string> = {
  'share.aria': 'Share',
  'share.title': 'Share',
  'share.popover': 'Share',
  'share.session': 'Current session',
  'share.copySessionId': 'Copy session ID',
  'share.copied': 'Copied',
  'share.copyFailed': 'Failed to copy: {message}',
  'share.recentApps': 'Recently published applications',
  'share.copyAppId': 'Copy application ID',
  'share.appsUnavailable': 'The publishing service is unavailable, applications cannot be listed.',
  'share.appsEmpty': 'No applications published yet.',
  'share.loading': 'Loading…',
}

/** Locale key union for the plugin's namespace. */
export type ShareKey = keyof typeof zh
