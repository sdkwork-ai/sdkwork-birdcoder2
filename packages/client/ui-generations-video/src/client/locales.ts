/** `generationsVideo` namespace dictionaries: the rail entry and generation page. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.video': '视频生成',
  'mode.video.label': '视频生成模式',
  'page.title': '视频生成',
  'page.subtitle': '通过 SDKWork Agents 生成视频',
  'page.input': '视频生成输入',
  'page.prompt': '视频描述',
  'page.prompt.placeholder': '描述你想生成的视频…',
  'page.generate': '生成',
  'page.configure': '请先在设置中配置 SDKWork API 环境。',
  'page.generating': '正在生成视频…',
  'page.error': '视频生成失败，请稍后重试。',
  'page.retry': '重新生成',
  'page.results': '生成结果',
  'page.result': '生成视频',
  'page.empty': '没有可展示的生成结果。',
} satisfies Record<string, string>

/** The generationsVideo namespace key union. */
export type VideoGenerationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.video': 'Video generation',
  'mode.video.label': 'Video generation mode',
  'page.title': 'Video generation',
  'page.subtitle': 'Generate videos with SDKWork Agents',
  'page.input': 'Video generation input',
  'page.prompt': 'Video prompt',
  'page.prompt.placeholder': 'Describe the video you want to generate…',
  'page.generate': 'Generate',
  'page.configure': 'Configure an SDKWork API environment in Settings first.',
  'page.generating': 'Generating video…',
  'page.error': 'The video could not be generated. Try again later.',
  'page.retry': 'Retry',
  'page.results': 'Results',
  'page.result': 'Generated video',
  'page.empty': 'There are no results to show yet.',
} satisfies Record<VideoGenerationsKey, string>
