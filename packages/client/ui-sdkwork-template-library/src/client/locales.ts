/** `template-library` namespace dictionaries: the sidebar entry copy and the
 * page's status faces. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.template-library': '模板库',
  'mode.template-library.label': '模板库',
  'surface.unconfigured.title': '模板库尚未配置',
  'surface.unconfigured.detail': '网关未配置，暂无法加载模板库。',
  'surface.error.title': '模板库加载失败',
  'surface.error.detail': '嵌入式模板库出现异常，请重试。',
  'surface.error.retry': '重试',
} satisfies Record<string, string>

/** The template-library namespace key union. */
export type TemplateLibraryKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.template-library': 'Template Library',
  'mode.template-library.label': 'Template Library',
  'surface.unconfigured.title': 'Template Library is not configured',
  'surface.unconfigured.detail': 'The gateway is not configured, so the Template Library cannot load.',
  'surface.error.title': 'Template Library failed to load',
  'surface.error.detail': 'The embedded Template Library hit an error. Please retry.',
  'surface.error.retry': 'Retry',
} satisfies Record<TemplateLibraryKey, string>
