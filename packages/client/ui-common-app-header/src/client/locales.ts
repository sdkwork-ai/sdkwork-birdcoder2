/** `appHeader` namespace dictionaries: module titles for the shared app header. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.work': '工作',
  'mode.video': '视频生成',
  'mode.image': '图片生成',
  'mode.appstore': '应用商店',
  'mode.knowledge': '知识库',
  'mode.drive': '云盘',
  'mode.assets': '资产',
  'mode.account': '账号',
  'mode.tokenPlan': 'Token Plan',
} satisfies Record<string, string>

/** The appHeader namespace key union. */
export type AppHeaderKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.work': 'Work',
  'mode.video': 'Video',
  'mode.image': 'Image',
  'mode.appstore': 'App Store',
  'mode.knowledge': 'Knowledge Base',
  'mode.drive': 'Drive',
  'mode.assets': 'Assets',
  'mode.account': 'Account',
  'mode.tokenPlan': 'Token Plan',
} satisfies Record<AppHeaderKey, string>
