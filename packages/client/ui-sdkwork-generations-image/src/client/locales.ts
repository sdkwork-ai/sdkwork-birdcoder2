/** `generationsImage` namespace dictionaries: the rail entry only. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.image': '图片生成',
  'mode.image.label': '图片生成模式',
  'auth.required.title': '登录后使用图片生成',
  'auth.required.detail': '图片生成需要登录后才能创建和管理你的生成作品。',
  'auth.required.action': '登录',
} satisfies Record<string, string>

/** The generationsImage namespace key union. */
export type ImageGenerationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.image': 'Image generation',
  'mode.image.label': 'Image generation mode',
} satisfies Record<ImageGenerationsKey, string>
