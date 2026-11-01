/** `sidebarLayout` namespace dictionaries: the sidebar-items settings page. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '侧边栏',
  'title': '侧边栏入口',
  'intro': '选择左侧栏要显示哪些入口。每次切换立即生效，偏好保存在本机。',
  'group.actions': '快捷入口',
  'group.pages': '页面',
  'group.panels': '面板',
  'toggle': '在左侧栏显示 {name}',
  'reset': '全部显示',
  'empty': '当前组合没有可配置的侧边栏入口。',
} satisfies Record<string, string>

/** The sidebarLayout namespace key union. */
export type SidebarLayoutKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Sidebar',
  'title': 'Sidebar entries',
  'intro': 'Choose which entries the left column shows. Every switch applies immediately, and the preference is stored on this device.',
  'group.actions': 'Quick entries',
  'group.pages': 'Pages',
  'group.panels': 'Panels',
  'toggle': 'Show {name} in the sidebar',
  'reset': 'Show all',
  'empty': 'This composition contributes no sidebar entries to configure.',
} satisfies Record<SidebarLayoutKey, string>
