/** `sdkworkUpdater` namespace dictionaries: update banner and preferences row. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sdkworkUpdater'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'banner.downloading': '正在下载 v{version}…',
  'banner.ready': 'v{version} 已就绪，重启后安装',
  'banner.available': '发现新版本 v{version}',
  'banner.dismiss': '稍后再说',
  'banner.notes': '更新内容',
  'banner.download': '下载更新',
  'banner.install': '重启并安装',
  'banner.releasePage': '查看发布页',
  'settings.title': '自动更新',
  'settings.description.installable': '发现新版本时提示下载；下载完成后重启安装',
  'settings.description.manual': '发现新版本时提示；请从发布页手动安装',
  'settings.autoCheck': '自动检查更新',
  'settings.channel': '更新通道',
  'settings.autoDownload': '自动下载',
  'settings.check': '检查更新',
  'status.checkFailed': '检查更新失败：{error}',
  'status.downloadFailed': '下载失败：{error}',
  'status.checking': '正在检查更新…',
  'status.available': '发现新版本 v{version}',
  'channel.follow': '跟随已安装版本',
  'channel.stable': '仅稳定版',
  'channel.rc': '稳定版和预发布',
} satisfies Record<string, string>

/** The updater namespace key union. */
export type SdkworkUpdaterKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'banner.downloading': 'Downloading v{version}…',
  'banner.ready': 'v{version} is ready; restart to install',
  'banner.available': 'Version v{version} is available',
  'banner.dismiss': 'Remind me later',
  'banner.notes': 'Release notes',
  'banner.download': 'Download update',
  'banner.install': 'Restart and install',
  'banner.releasePage': 'View release page',
  'settings.title': 'Automatic updates',
  'settings.description.installable': 'Prompts when a new version is available; installs after the download when you restart',
  'settings.description.manual': 'Prompts when a new version is available; install manually from the release page',
  'settings.autoCheck': 'Check for updates automatically',
  'settings.channel': 'Update channel',
  'settings.autoDownload': 'Download automatically',
  'settings.check': 'Check for updates',
  'status.checkFailed': 'Update check failed: {error}',
  'status.downloadFailed': 'Download failed: {error}',
  'status.checking': 'Checking for updates…',
  'status.available': 'Version v{version} is available',
  'channel.follow': 'Follow the installed version',
  'channel.stable': 'Stable releases only',
  'channel.rc': 'Stable and pre-releases',
} satisfies Record<SdkworkUpdaterKey, string>
