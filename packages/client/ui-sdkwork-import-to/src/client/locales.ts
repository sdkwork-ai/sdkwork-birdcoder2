/**
 * Dialog copy. This file is the locale owner for the plugin: presentation
 * components read every label from here.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */

/** One locale's dialog copy. */
export interface ImportToCopy {
  readonly title: string
  readonly subtitle: string
  readonly nameLabel: string
  readonly modelLabel: string
  readonly modelRequired: string
  readonly formatLabel: string
  readonly targetLabel: string
  readonly keyLabel: string
  readonly filesHeading: string
  readonly mergeHint: string
  readonly notesHeading: string
  readonly restartHeading: string
  readonly copyAction: string
  readonly copiedAction: string
  readonly downloadAction: string
  readonly copyInstallAction: string
  readonly installCopied: string
  readonly copyLinkAction: string
  readonly linkCopied: string
  readonly openInCcSwitchAction: string
  readonly launchHeading: string
  readonly closeAction: string
  readonly planUnavailable: string
  readonly fragmentHeading: string
  readonly scriptHeading: string
}

/** Chinese copy (the console's default language). */
const ZH: ImportToCopy = {
  title: '导入到 {target}',
  subtitle: '按 CC Switch「点击使用」的写入语义生成下面这些文件。',
  nameLabel: '供应商名称',
  modelLabel: '模型',
  modelRequired: '这个工具需要模型',
  formatLabel: '接口协议',
  targetLabel: '目标工具',
  keyLabel: 'API Key',
  filesHeading: '写入文件',
  mergeHint: '文件已存在时只合并 managedKeys 列出的键，其他内容保留。',
  notesHeading: '注意',
  restartHeading: '生效方式',
  copyAction: '复制',
  copiedAction: '已复制',
  downloadAction: '下载',
  copyInstallAction: '复制安装命令',
  installCopied: '安装命令已复制',
  copyLinkAction: '复制 CC Switch 链接',
  linkCopied: '链接已复制',
  openInCcSwitchAction: '在 CC Switch 中一键使用',
  launchHeading: '启动命令',
  closeAction: '关闭',
  planUnavailable: '填上模型后生成配置。',
  fragmentHeading: '合并片段',
  scriptHeading: '安装命令',
}

/** English copy. */
const EN: ImportToCopy = {
  title: 'Import into {target}',
  subtitle: 'Generates the live files with the same write semantics as CC Switch\'s click-to-use.',
  nameLabel: 'Provider name',
  modelLabel: 'Model',
  modelRequired: 'This target needs a model',
  formatLabel: 'API format',
  targetLabel: 'Target',
  keyLabel: 'API key',
  filesHeading: 'Files',
  mergeHint: 'An existing file only receives the keys listed in managedKeys; everything else stays.',
  notesHeading: 'Notes',
  restartHeading: 'When it takes effect',
  copyAction: 'Copy',
  copiedAction: 'Copied',
  downloadAction: 'Download',
  copyInstallAction: 'Copy install command',
  installCopied: 'Install command copied',
  copyLinkAction: 'Copy CC Switch link',
  linkCopied: 'Link copied',
  openInCcSwitchAction: 'Open in CC Switch',
  launchHeading: 'Launch command',
  closeAction: 'Close',
  planUnavailable: 'Enter a model to generate the files.',
  fragmentHeading: 'Merge fragment',
  scriptHeading: 'Install command',
}

/**
 * Copy for the active language.
 * @param language - the client's active locale id; falls back to the browser's language.
 * @returns the Chinese copy on Chinese locales, English otherwise.
 */
export function importToCopy(language?: string): ImportToCopy {
  const tag = language ?? (typeof navigator === 'undefined' ? 'en' : navigator.language)
  return /^zh/i.test(tag) ? ZH : EN
}

/**
 * Fill `{target}` in the dialog title.
 * @param template - title template.
 * @param target - target label.
 * @returns the display title.
 */
export function fillTitle(template: string, target: string): string {
  return template.replace('{target}', target)
}
