/** Settings-menu shell and menu dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'menu.settings': '设置',
  'menu.appearance': '外观',
  'menu.appearance.light': '浅色',
  'menu.appearance.dark': '深色',
  'menu.appearance.system': '跟随系统',
  'menu.help': '帮助',
  'menu.help.soon': '帮助功能即将上线',
  'menu.feedback': '反馈',
  'menu.checkUpdates': '检查更新',
  'menu.signIn': '登录 / 注册',
  'menu.membership': '会员等级',
  'menu.points': '积分余额',
  'menu.logout': '退出登录',
} satisfies Record<string, string>

/** The settings-menu namespace key union. */
export type SettingsMenuKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'menu.settings': 'Settings',
  'menu.appearance': 'Appearance',
  'menu.appearance.light': 'Light',
  'menu.appearance.dark': 'Dark',
  'menu.appearance.system': 'Follow system',
  'menu.help': 'Help',
  'menu.help.soon': 'Help is coming soon',
  'menu.feedback': 'Feedback',
  'menu.checkUpdates': 'Check for updates',
  'menu.signIn': 'Sign in / Register',
  'menu.membership': 'Membership',
  'menu.points': 'Points balance',
  'menu.logout': 'Sign out',
} satisfies Record<SettingsMenuKey, string>
