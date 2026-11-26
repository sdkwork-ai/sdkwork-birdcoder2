/** `mobileConnect` namespace dictionaries: the rail shortcut and the scan card it shows. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'rail.label': '移动端连接',
  'rail.aria': '打开移动端连接',
  'dialog.title': '移动端连接',
  'dialog.close': '关闭',
  'tabs.label': '扫码目标',
  'tab.app': '移动端 App',
  'tab.miniProgram': '微信小程序',
  'title.app': '扫码下载 BirdCoder App',
  'title.miniProgram': '扫码打开 BirdCoder 小程序',
  'qr.app': 'BirdCoder App 下载二维码',
  'qr.miniProgram': 'BirdCoder 小程序二维码',
  'qr.loading': '正在载入二维码',
  'qr.unconfigured': '未配置扫码地址',
  'qr.unconfiguredHint': '在部署配置中填写地址后即可扫码。',
  remote: '允许移动设备远程连接',
  'remote.readOnly': '当前设置不可写',
  'remote.failed': '开关保存失败，请重试',
} satisfies Record<string, string>

/** The mobileConnect namespace key union. */
export type MobileConnectKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en: Record<MobileConnectKey, string> = {
  'rail.label': 'Mobile connection',
  'rail.aria': 'Open mobile connection',
  'dialog.title': 'Mobile connection',
  'dialog.close': 'Close',
  'tabs.label': 'Scan destination',
  'tab.app': 'Mobile App',
  'tab.miniProgram': 'WeChat Mini Program',
  'title.app': 'Scan to download the BirdCoder App',
  'title.miniProgram': 'Scan to open the BirdCoder Mini Program',
  'qr.app': 'BirdCoder App download QR code',
  'qr.miniProgram': 'BirdCoder Mini Program QR code',
  'qr.loading': 'Loading the QR code',
  'qr.unconfigured': 'No scan address configured',
  'qr.unconfiguredHint': 'A deployment address shows a code here.',
  remote: 'Allow remote connections from mobile devices',
  'remote.readOnly': 'This setting is read-only',
  'remote.failed': 'The switch could not be saved. Try again.',
}
