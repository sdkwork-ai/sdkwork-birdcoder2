/** `mobileSimulator` namespace dictionaries: toolbar, frame, and modal copy. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'mobileSimulator'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'toolbar.device': '选择设备',
  'toolbar.rotateLandscape': '切换横屏',
  'toolbar.rotatePortrait': '切换竖屏',
  'toolbar.url': '网址',
  'toolbar.urlPlaceholder': '输入网址',
  'toolbar.close': '关闭模拟器',
  'toolbar.closeTitle': '关闭 (Esc)',
  'frame.title': '{device} 模拟器',
  'modal.aria': '移动端模拟器',
} satisfies Record<string, string>

/** The mobile-simulator namespace key union. */
export type MobileSimulatorKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'toolbar.device': 'Select device',
  'toolbar.rotateLandscape': 'Switch to landscape',
  'toolbar.rotatePortrait': 'Switch to portrait',
  'toolbar.url': 'URL',
  'toolbar.urlPlaceholder': 'Enter a URL',
  'toolbar.close': 'Close simulator',
  'toolbar.closeTitle': 'Close (Esc)',
  'frame.title': '{device} simulator',
  'modal.aria': 'Mobile simulator',
} satisfies Record<MobileSimulatorKey, string>
