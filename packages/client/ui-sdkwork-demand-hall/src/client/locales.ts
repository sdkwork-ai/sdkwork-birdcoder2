/** `demand-hall` namespace dictionaries: the sidebar entry copy and the
 * page's status faces. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.demand-hall': '需求大厅',
  'mode.demand-hall.label': '需求大厅',
  'surface.unconfigured.title': '需求大厅尚未配置',
  'surface.unconfigured.detail': '网关未配置，暂无法加载需求大厅。',
  'surface.error.title': '需求大厅加载失败',
  'surface.error.detail': '嵌入式需求大厅出现异常，请重试。',
  'surface.error.retry': '重试',
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
}
