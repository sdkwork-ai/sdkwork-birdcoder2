/** `drive` namespace dictionaries: the rail entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.drive': '云盘',
  'mode.drive.label': '云盘模式',
  'page.placeholder': '云盘建设中，敬请期待',
  'page.back': '点击左侧「代码」返回工作台',
} satisfies Record<string, string>

/** The drive namespace key union. */
export type DriveKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.drive': 'Drive',
  'mode.drive.label': 'Drive mode',
  'page.placeholder': 'The Drive is under construction.',
  'page.back': 'Click Code in the rail to return to the workbench',
} satisfies Record<DriveKey, string>
