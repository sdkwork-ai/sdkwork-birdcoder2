/**
 * `sdkwork-workspace-row-menus` namespace dictionaries: the row-action menu
 * copy of the sidebar workspace browser (workspace menu, session menu, and
 * the project context menu).
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'rename': '重命名',
  'menu.fork': '分叉会话',
  'menu.archiveSession': '归档会话',
  'delete.workspace': '删除工作区',
  'context.openMenu': '打开菜单',
  'actions.workspace.aria': '工作区“{name}”的操作',
  'actions.session.aria': '会话“{name}”的操作',
} satisfies Record<string, string>

/** The sdkwork-workspace-row-menus namespace key union. */
export type SdkworkRowMenusKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'rename': 'Rename',
  'menu.fork': 'Fork session',
  'menu.archiveSession': 'Archive session',
  'delete.workspace': 'Delete workspace',
  'context.openMenu': 'Open menu',
  'actions.workspace.aria': 'Workspace actions for {name}',
  'actions.session.aria': 'Session actions for {name}',
} satisfies Record<SdkworkRowMenusKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'sdkwork-workspace-row-menus'
