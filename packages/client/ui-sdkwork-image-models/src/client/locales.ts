/**
 * `sdkworkImageModels` namespace dictionaries: the image model settings page.
 *
 * Copy here is page chrome only. Vendor names, model ids, base URLs, and the
 * projected file path are data — they render verbatim in whatever language the
 * catalog or the user wrote them in.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '图片模型',
  'title': '图片模型配置',
  'intro': '管理图片生成所用的服务商：官方厂商直连，或任意中转站。配置保存在独立文件中，供技能直接调用。',
  'file.label': '配置文件',
  'file.hint': '该文件随设置实时更新，技能与脚本可直接读取。',
  'secrets.label': '在配置文件中写入密钥原文',
  'secrets.hint': '默认关闭：文件只记录环境变量名与是否已配置，密钥仍从设置文档读取。',

  'provider.section': '服务商',
  'provider.empty': '尚未配置任何服务商。',
  'provider.addRelay': '添加中转站',
  'provider.kind.official': '官方',
  'provider.kind.relay': '中转站',
  'provider.default': '默认',
  'provider.setDefault': '设为默认',
  'provider.enable': '启用该服务商',
  'provider.expand': '展开配置',
  'provider.collapse': '收起配置',
  'provider.remove': '删除',
  'provider.save': '保存',
  'provider.discard': '放弃修改',
  'provider.models': '模型',
  'provider.models.empty': '暂无模型，可在下方添加。',

  'field.label': '名称',
  'field.baseUrl': 'Base URL',
  'field.apiKeyEnv': '密钥环境变量',
  'field.apiKey': 'API 密钥',
  'field.apiKey.stored': '已配置密钥，留空表示保持不变。',
  'field.apiKey.none': '未配置密钥。',
  'field.vendor': '厂商代码',
  'field.protocol': '协议',
  'field.region': '区域',

  'model.id': '模型 ID',
  'model.displayName': '显示名称',
  'model.size': '尺寸',
  'model.quality': '质量',
  'model.count': '张数',
  'model.enable': '启用该模型',
  'model.remove': '移除',
  'model.add': '添加模型',

  'state.loading': '正在读取配置…',
  'state.unavailable': '该设置项在当前部署中不可用。',
  'state.readOnly': '设置文档为只读，无法保存修改。',
  'state.saving': '正在保存…',
  'state.failed': '保存未生效，请检查填写内容后重试。',
} satisfies Record<string, string>

/** The sdkworkImageModels namespace key union. */
export type ImageModelsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Image models',
  'title': 'Image model configuration',
  'intro': 'Manage the providers image generation calls: official vendor endpoints, or any relay station. The configuration is saved to its own file for skills to read.',
  'file.label': 'Configuration file',
  'file.hint': 'The file follows this section live; skills and scripts can read it directly.',
  'secrets.label': 'Write API keys into the configuration file',
  'secrets.hint': 'Off by default: the file records the environment variable name and whether a key is configured, and the settings document keeps the key.',

  'provider.section': 'Providers',
  'provider.empty': 'No provider is configured yet.',
  'provider.addRelay': 'Add relay',
  'provider.kind.official': 'Official',
  'provider.kind.relay': 'Relay',
  'provider.default': 'Default',
  'provider.setDefault': 'Set as default',
  'provider.enable': 'Enable this provider',
  'provider.expand': 'Show configuration',
  'provider.collapse': 'Hide configuration',
  'provider.remove': 'Remove',
  'provider.save': 'Save',
  'provider.discard': 'Discard changes',
  'provider.models': 'Models',
  'provider.models.empty': 'No model yet; add one below.',

  'field.label': 'Name',
  'field.baseUrl': 'Base URL',
  'field.apiKeyEnv': 'Key environment variable',
  'field.apiKey': 'API key',
  'field.apiKey.stored': 'A key is configured; leave blank to keep it.',
  'field.apiKey.none': 'No key configured.',
  'field.vendor': 'Vendor code',
  'field.protocol': 'Protocol',
  'field.region': 'Region',

  'model.id': 'Model ID',
  'model.displayName': 'Display name',
  'model.size': 'Size',
  'model.quality': 'Quality',
  'model.count': 'Images per call',
  'model.enable': 'Enable this model',
  'model.remove': 'Remove',
  'model.add': 'Add model',

  'state.loading': 'Reading the configuration…',
  'state.unavailable': 'This settings page is not available in this deployment.',
  'state.readOnly': 'The settings document is read-only; changes cannot be saved.',
  'state.saving': 'Saving…',
  'state.failed': 'The save did not take effect; check the values and try again.',
} satisfies Record<ImageModelsKey, string>
