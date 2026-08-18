/** `generationsImage` namespace dictionaries: the rail entry and generation page. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.image': '图片生成',
  'mode.image.label': '图片生成模式',
  'page.title': '图片生成',
  'page.subtitle': '通过 SDKWork Agents 生成图片',
  'page.input': '图片生成输入',
  'page.prompt': '图片描述',
  'page.prompt.placeholder': '描述你想生成的图片…',
  'page.generate': '生成',
  'page.configure': '请先在设置中配置 SDKWork API 环境。',
  'page.generating': '正在生成图片…',
  'page.error': '图片生成失败，请稍后重试。',
  'page.retry': '重新生成',
  'page.results': '生成结果',
  'page.result': '生成图片',
  'page.empty': '没有可展示的生成结果。',
} satisfies Record<string, string>

/** The generationsImage namespace key union. */
export type ImageGenerationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.image': 'Image generation',
  'mode.image.label': 'Image generation mode',
  'page.title': 'Image generation',
  'page.subtitle': 'Generate images with SDKWork Agents',
  'page.input': 'Image generation input',
  'page.prompt': 'Image prompt',
  'page.prompt.placeholder': 'Describe the image you want to generate…',
  'page.generate': 'Generate',
  'page.configure': 'Configure an SDKWork API environment in Settings first.',
  'page.generating': 'Generating image…',
  'page.error': 'The image could not be generated. Try again later.',
  'page.retry': 'Retry',
  'page.results': 'Results',
  'page.result': 'Generated image',
  'page.empty': 'There are no results to show yet.',
} satisfies Record<ImageGenerationsKey, string>
