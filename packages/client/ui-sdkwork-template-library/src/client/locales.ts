/** `template-library` namespace dictionaries: the sidebar entry copy, the
 * page's status faces, and the 部署模板 install panel copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.template-library': '模板库',
  'mode.template-library.label': '模板库',
  'surface.unconfigured.title': '模板库尚未配置',
  'surface.unconfigured.detail': '网关未配置，暂无法加载模板库。',
  'surface.error.title': '模板库加载失败',
  'surface.error.detail': '嵌入式模板库出现异常，请重试。',
  'surface.error.retry': '重试',
  'deploy.title': '部署模板（可安装）',
  'deploy.searchPlaceholder': '搜索可安装的部署模板',
  'deploy.search': '搜索',
  'deploy.empty': '没有匹配的部署模板',
  'deploy.searchFailed': '搜索失败：{message}',
  'deploy.install': '安装',
  'deploy.installing': '安装中…',
  'deploy.downloadProgress': '下载中… {percent}%',
  'deploy.writeProgress': '写入 {index}/{total}：{file}',
  'deploy.done': '已安装 {count} 个文件到 {directory}',
  'deploy.doneHint': '将该目录添加为工作区并新建会话，即可基于模板继续开发',
  'deploy.installFailed': '安装失败：{message}',
  'deploy.noDirectory': '未选择安装目录',
} satisfies Record<string, string>

/** The template-library namespace key union. */
export type TemplateLibraryKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<TemplateLibraryKey, string> = {
  'mode.template-library': 'Template Library',
  'mode.template-library.label': 'Template Library',
  'surface.unconfigured.title': 'Template Library is not configured',
  'surface.unconfigured.detail': 'The gateway is not configured, so the Template Library cannot load.',
  'surface.error.title': 'Template Library failed to load',
  'surface.error.detail': 'The embedded Template Library hit an error. Please retry.',
  'surface.error.retry': 'Retry',
  'deploy.title': 'Deploy templates (installable)',
  'deploy.searchPlaceholder': 'Search installable deploy templates',
  'deploy.search': 'Search',
  'deploy.empty': 'No matching deploy templates',
  'deploy.searchFailed': 'Search failed: {message}',
  'deploy.install': 'Install',
  'deploy.installing': 'Installing…',
  'deploy.downloadProgress': 'Downloading… {percent}%',
  'deploy.writeProgress': 'Writing {index}/{total}: {file}',
  'deploy.done': 'Installed {count} file(s) into {directory}',
  'deploy.doneHint': 'Add the directory as a workspace and start a session to continue from the template.',
  'deploy.installFailed': 'Install failed: {message}',
  'deploy.noDirectory': 'No install directory picked',
}
