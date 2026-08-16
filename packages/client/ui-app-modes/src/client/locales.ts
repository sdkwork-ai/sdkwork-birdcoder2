/** `appMode` namespace dictionaries: mode names, rail tooltips, and settings-row copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'rail.label': '应用模式',
  'mode.code': '代码',
  'mode.work': '工作',
  'mode.video': '视频',
  'mode.image': '图片',
  'mode.appstore': '应用商店',
  'mode.code.label': '代码模式',
  'mode.work.label': '工作模式',
  'mode.video.label': '视频模式',
  'mode.image.label': '图片模式',
  'mode.appstore.label': '应用商店模式',
  'page.placeholder': '页面建设中，敬请期待',
  'page.back': '点击左侧「代码」返回工作台',
  'sidebar.show': '显示侧边栏',
  'sidebar.show.description': '关闭后侧边栏收起为图标栏，模式栏保持可见',
} satisfies Record<string, string>

/** The appMode namespace key union. */
export type AppModeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'rail.label': 'App modes',
  'mode.code': 'Code',
  'mode.work': 'Work',
  'mode.video': 'Video',
  'mode.image': 'Image',
  'mode.appstore': 'App Store',
  'mode.code.label': 'Code mode',
  'mode.work.label': 'Work mode',
  'mode.video.label': 'Video mode',
  'mode.image.label': 'Image mode',
  'mode.appstore.label': 'App Store mode',
  'page.placeholder': 'This page is under construction.',
  'page.back': 'Click Code in the rail to return to the workbench',
  'sidebar.show': 'Show sidebar',
  'sidebar.show.description': 'When off, the sidebar collapses to an icon rail; the mode rail stays visible',
} satisfies Record<AppModeKey, string>
