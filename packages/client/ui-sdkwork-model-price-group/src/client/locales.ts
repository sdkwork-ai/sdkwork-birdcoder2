/** Model price-group Web dictionaries. */

/** Locale namespace owned by the model price-group Web UI. */
export const NS = 'model-price-group'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  'row.label': '模型价格分组',
  'row.value.inherited': '默认',
  'pane.description': '选择当前模型请求使用的账号分组。分组决定该模型可用的账号池与价格档位。',
  'pane.inherit': '跟随默认分组',
  'pane.loading': '正在加载分组…',
  'pane.empty': '当前模型没有可选分组。',
  'pane.error': '无法加载分组：{message}',
  'pane.retry': '重试',
  'save.failed': '无法保存模型价格分组：{message}',
} satisfies Record<string, string>

/** Model price-group locale key union. */
export type PriceGroupKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  'row.label': 'Model price group',
  'row.value.inherited': 'Default',
  'pane.description': 'Choose the account group that serves this model. The group decides the usable account pool and the price tier.',
  'pane.inherit': 'Follow the default group',
  'pane.loading': 'Loading groups…',
  'pane.empty': 'No group can serve this model.',
  'pane.error': 'Could not load groups: {message}',
  'pane.retry': 'Retry',
  'save.failed': 'Could not save the model price group: {message}',
} satisfies Record<PriceGroupKey, string>
