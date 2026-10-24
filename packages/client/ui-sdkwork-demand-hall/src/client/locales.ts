/** `demand-hall` namespace dictionaries: the sidebar entry copy, the page's
 * status faces, and the demand → project bootstrap copy (progress line and the
 * session brief the new project starts with). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.demand-hall': '需求大厅',
  'mode.demand-hall.label': '需求大厅',
  'surface.unconfigured.title': '需求大厅尚未配置',
  'surface.unconfigured.detail': '网关未配置，暂无法加载需求大厅。',
  'surface.error.title': '需求大厅加载失败',
  'surface.error.detail': '嵌入式需求大厅出现异常，请重试。',
  'surface.error.retry': '重试',
  'project.starting': '正在创建项目…',
  'project.started': '项目已创建：{{title}}，已在当前窗口打开新会话。',
  'project.failed': '创建项目失败：{{message}}',
  'project.brief.heading': '请按下面的需求开工：{{title}}',
  'project.brief.demandId': '需求编号：{{id}}',
  'project.brief.category': '需求分类：{{category}}',
  'project.brief.appForm': '应用形态：{{appForm}}',
  'project.brief.spec': '交付形态规范：sdkwork-specs/{{spec}}（先阅读该规范，再初始化项目结构与依赖）。',
  'project.brief.budget': '需求预算：{{budget}}',
  'project.brief.deadline': '截标时间：{{deadline}}',
  'project.brief.detail': '需求详情：\n{{description}}',
  'project.brief.instruction': '请先初始化一个可运行的项目骨架（目录结构、依赖清单、启动脚本），再按上面的需求实现功能；关键取舍写入 README。',
} satisfies Record<string, string>

/** The demand-hall namespace key union. */
export type DemandHallKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<DemandHallKey, string> = {
  'mode.demand-hall': 'Demand Hall',
  'mode.demand-hall.label': 'Demand Hall',
  'surface.unconfigured.title': 'Demand Hall is not configured',
  'surface.unconfigured.detail': 'The gateway is not configured, so the Demand Hall cannot load.',
  'surface.error.title': 'Demand Hall failed to load',
  'surface.error.detail': 'The embedded Demand Hall hit an error. Please retry.',
  'surface.error.retry': 'Retry',
  'project.starting': 'Creating the project…',
  'project.started': 'Project created: {{title}}. The new session is open in this window.',
  'project.failed': 'Project creation failed: {{message}}',
  'project.brief.heading': 'Start work on this demand: {{title}}',
  'project.brief.demandId': 'Demand id: {{id}}',
  'project.brief.category': 'Category: {{category}}',
  'project.brief.appForm': 'Application form: {{appForm}}',
  'project.brief.spec': 'Delivery standard: sdkwork-specs/{{spec}} (read it before initializing the project structure and dependencies).',
  'project.brief.budget': 'Budget: {{budget}}',
  'project.brief.deadline': 'Bid deadline: {{deadline}}',
  'project.brief.detail': 'Demand details:\n{{description}}',
  'project.brief.instruction': 'First initialize a runnable project skeleton (directory layout, dependency manifest, start script), then implement the demand above; record the key trade-offs in the README.',
}
