/** `generationsVideo` namespace dictionaries: the rail entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.video': '视频生成',
  'mode.video.label': '视频生成模式',
  'auth.required.title': '登录后使用视频生成',
  'auth.required.detail': '视频生成需要登录后才能创建和管理你的生成作品。',
  'auth.required.action': '登录',
} satisfies Record<string, string>

/** The generationsVideo namespace key union. */
export type VideoGenerationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.video': 'Video generation',
  'mode.video.label': 'Video generation mode',
  'auth.required.title': 'Sign in to use video generation',
  'auth.required.detail': 'Sign in to create and manage your generated videos.',
  'auth.required.action': 'Sign in',
} satisfies Record<VideoGenerationsKey, string>
