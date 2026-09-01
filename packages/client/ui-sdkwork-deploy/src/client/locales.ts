/** `deploy` namespace dictionaries for the SDKWork publish plugin. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'deploy'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'publish.aria': '发布应用',
  'publish.title': '发布应用',
  'dialog.openFailed': '无法打开发布对话框：{message}',
  'directory.pickFailed': '无法选择目录：{message}',
  'dialog.placeholder': '发布目录将作为 deploy_app 的源码来源',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<DeployKey, string> = {
  'publish.aria': 'Publish application',
  'publish.title': 'Publish application',
  'dialog.openFailed': 'Cannot open the publish dialog: {message}',
  'directory.pickFailed': 'Cannot pick a directory: {message}',
  'dialog.placeholder': 'The source directory is recorded on the deploy_app',
}

/** Locale key union for the plugin's namespace. */
export type DeployKey = keyof typeof zh
