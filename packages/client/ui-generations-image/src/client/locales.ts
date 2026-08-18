/** `generationsImage` namespace dictionaries: the rail entry only. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.image': '图片生成',
  'mode.image.label': '图片生成模式',
} satisfies Record<string, string>

/** The generationsImage namespace key union. */
export type ImageGenerationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.image': 'Image generation',
  'mode.image.label': 'Image generation mode',
} satisfies Record<ImageGenerationsKey, string>
