/** `generationsAssets` namespace dictionaries: the rail entry only. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.assets': '资产',
  'mode.assets.label': '资产模式',
} satisfies Record<string, string>

/** The generationsAssets namespace key union. */
export type AssetsGenerationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.assets': 'Assets',
  'mode.assets.label': 'Assets mode',
} satisfies Record<AssetsGenerationsKey, string>
