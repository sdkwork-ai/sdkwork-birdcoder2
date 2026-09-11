/** `appHeader` namespace dictionaries: the module names the host window's title carries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.work': '工作',
  'mode.pullRequest': 'Pull Request',
  'mode.automation': '定时任务',
  'mode.video': '视频生成',
  'mode.image': '图片生成',
  'mode.document': '文档生成',
  'mode.appstore': '应用商店',
  'mode.knowledge': '知识库',
  'mode.course': '课程',
  'mode.drive': '云盘',
  'mode.markets': '插件市场',
  'mode.assets': '资产',
  'mode.account': '账号',
  'mode.tokenPlan': 'Token Plan',
} satisfies Record<string, string>

/** The appHeader namespace key union. */
export type AppHeaderKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.work': 'Work',
  'mode.pullRequest': 'Pull Request',
  'mode.automation': 'Scheduled tasks',
  'mode.video': 'Video',
  'mode.image': 'Image',
  'mode.document': 'Document',
  'mode.appstore': 'App Store',
  'mode.knowledge': 'Knowledge Base',
  'mode.course': 'Courses',
  'mode.drive': 'Drive',
  'mode.markets': 'Marketplace',
  'mode.assets': 'Assets',
  'mode.account': 'Account',
  'mode.tokenPlan': 'Token Plan',
} satisfies Record<AppHeaderKey, string>
