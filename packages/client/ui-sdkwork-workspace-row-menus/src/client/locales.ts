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
  'menu.openFolder': '打开文件夹',
  'menu.copyPath': '复制路径',
  'menu.openTerminal': '在终端打开',
  'menu.copySessionId': '复制会话ID',
  'menu.exportSessionLog': '导出会话日志',
  'menu.publishProject': '发布项目',
  'context.openMenu': '打开菜单',
  'actions.workspace.aria': '工作区“{name}”的操作',
  'actions.session.aria': '会话“{name}”的操作',
  'feedback.copied': '已复制',
  'feedback.opened': '已打开',
  'feedback.terminalOpened': '已在终端打开',
  'feedback.exportStarted': '已开始导出',
  'feedback.noDirectory': '没有可用的目录',
} satisfies Record<string, string>

/** The sdkwork-workspace-row-menus namespace key union. */
export type SdkworkRowMenusKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'rename': 'Rename',
  'menu.fork': 'Fork session',
  'menu.archiveSession': 'Archive session',
  'delete.workspace': 'Delete workspace',
  'menu.openFolder': 'Open folder',
  'menu.copyPath': 'Copy path',
  'menu.openTerminal': 'Open in terminal',
  'menu.copySessionId': 'Copy session ID',
  'menu.exportSessionLog': 'Export session log',
  'menu.publishProject': 'Publish project',
  'context.openMenu': 'Open menu',
  'actions.workspace.aria': 'Workspace actions for {name}',
  'actions.session.aria': 'Session actions for {name}',
  'feedback.copied': 'Copied',
  'feedback.opened': 'Opened',
  'feedback.terminalOpened': 'Opened in terminal',
  'feedback.exportStarted': 'Export started',
  'feedback.noDirectory': 'No directory available',
} satisfies Record<SdkworkRowMenusKey, string>

/** Dictionary namespace owned by this plugin. */
export const NS = 'sdkwork-workspace-row-menus'
