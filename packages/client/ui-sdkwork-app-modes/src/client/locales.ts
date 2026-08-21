/** `appMode` namespace dictionaries: mode names, rail tooltips, and settings-row copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'rail.label': '应用模式',
  'mode.code': '代码',
  'mode.work': '工作',
  'mode.code.label': '代码模式',
  'mode.work.label': '工作模式',
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
  'mode.code.label': 'Code mode',
  'mode.work.label': 'Work mode',
  'page.placeholder': 'This page is under construction.',
  'page.back': 'Click Code in the rail to return to the workbench',
  'sidebar.show': 'Show sidebar',
  'sidebar.show.description': 'When off, the sidebar collapses to an icon rail; the mode rail stays visible',
} satisfies Record<AppModeKey, string>
