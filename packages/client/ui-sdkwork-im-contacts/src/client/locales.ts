/** `imContacts` namespace dictionaries: the contacts rail entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.contacts': '通讯录',
  'mode.contacts.label': '通讯录模式',
  'auth.required.title': '登录后使用通讯录',
  'auth.required.detail': '登录 SDKWork 账号后即可查看联系人和好友申请。',
  'auth.required.action': '登录',
  'state.loading': '正在连接 IM…',
  'state.unavailable': 'IM 暂不可用，请检查网络或环境配置。',
  'state.initFailed': 'IM SDK 初始化失败，请检查 IM 网关地址与会话配置。',
  'state.loadFailed': 'IM 界面加载失败，请检查嵌入包地址与网络连接。',
  'state.notConfigured': 'IM 未配置：缺少嵌入包地址。',
  'state.signInRequired': '登录后才能使用 IM。',
  'state.retry': '重试',
} satisfies Record<string, string>

/** The imContacts namespace key union. */
export type ImContactsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.contacts': 'Contacts',
  'mode.contacts.label': 'Contacts mode',
  'auth.required.title': 'Sign in to use Contacts',
  'auth.required.detail': 'Sign in with your SDKWork account to browse contacts and friend requests.',
  'auth.required.action': 'Sign in',
  'state.loading': 'Connecting to IM…',
  'state.unavailable': 'IM is unavailable. Check the network or deployment environment.',
  'state.initFailed': 'The IM SDK could not be initialized. Check the IM gateway URL and session configuration.',
  'state.loadFailed': 'The IM interface could not load. Check the embed bundle URL and the network.',
  'state.notConfigured': 'IM is not configured: the embed bundle URL is missing.',
  'state.signInRequired': 'Sign in to use IM.',
  'state.retry': 'Retry',
} satisfies Record<ImContactsKey, string>
