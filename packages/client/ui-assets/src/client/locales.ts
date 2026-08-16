/** `assets` namespace dictionaries: the rail entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.assets': '资产',
  'mode.assets.label': '资产模式',
  'page.placeholder': '资产中心建设中，敬请期待',
  'page.back': '点击左侧「代码」返回工作台',
} satisfies Record<string, string>

/** The assets namespace key union. */
export type AssetsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.assets': 'Assets',
  'mode.assets.label': 'Assets mode',
  'page.placeholder': 'The Assets center is under construction.',
  'page.back': 'Click Code in the rail to return to the workbench',
} satisfies Record<AssetsKey, string>
